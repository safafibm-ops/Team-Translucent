"""Automatic retraining of the anomaly model from inspector decisions.

When a person clicks Pass in the review queue, the photo is a confirmed good part. Once
RETRAIN_AFTER such photos are waiting, a background job:

1. adds the new photos' patch patterns to the model's memory of good parts
   (only patterns the model has not seen yet, so the memory stays small),
2. sits an exam: the old and the new model score the same known-defect photos (and known
   good photos, if there are any),
3. switches to the new model only if it still catches as many defects and raises no more
   false alarms. Otherwise the old model stays.

No GPU and none of the original training photos are needed: the memory lives in the model file.
"""
import copy
import json
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2

from . import config

VERSIONS = config.ROOT / "models" / "anomaly" / "versions"
LEARNED = config.ROOT / "data" / "labels" / "learned.txt"   # good photos already in the memory
LOG = config.ROOT / "data" / "retrain_log.csv"
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp"}

ORIGINAL = {"version": 1, "time": None, "photos": 0, "note": "original model from training"}
KEEP = 5   # retrained versions kept on disk (about 95 MB each); the original is always kept

status = {"state": "idle", "step": "", "progress": 0.0, "version": 1, "history": [], "exam": None, "error": None,
          "versions": [ORIGINAL]}
_original = {}   # the memory bank from model.ckpt, so version 1 can always be restored
_lock = threading.Lock()
_baseline = {}   # (version, exam photos) -> exam result, so the old model is examined only once


def _images(folder, limit=None):
    folder = Path(folder)
    if not folder.is_dir():
        return []
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_TYPES)
    return files[:limit] if limit else files


def exam_photos():
    """Known-defect and known-good photos the models are tested on (never trained on)."""
    trained = {n.split("_", 1)[-1] for n in _learned()}     # review photos are saved as <id>_<name>
    trained |= {p.name.split("_", 1)[-1] for p in waiting()}
    keep = lambda files: [p for p in files if p.name not in trained]
    defect = next((f for d in config.EXAM_DEFECT_DIRS if (f := keep(_images(d))[:config.EXAM_LIMIT])), [])
    good = keep(_images(config.EXAM_GOOD_DIR))[:config.EXAM_LIMIT]
    return defect, good


def _learned():
    return set(LEARNED.read_text().split("\n")) - {""} if LEARNED.exists() else set()


def waiting():
    """Confirmed good photos not yet learned."""
    done = _learned()
    return [p for p in _images(config.ROOT / "data" / "labels" / "good") if p.name not in done]


def _set(**kw):
    with _lock:
        status.update(kw)


def view():
    with _lock:
        out = dict(status)
    defect, good = exam_photos()
    out.update(waiting=len(waiting()), needed=config.RETRAIN_AFTER,
               exam={"defect": len(defect), "good": len(good)})
    return out


# ---------- the model's memory -------------------------------------------------------------

def _tensor(image_bgr, lm):
    import torch
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    device = next(lm.parameters()).device      # CPU for inspection, GPU while retraining if there is one
    return torch.from_numpy(rgb).permute(2, 0, 1).float().div(255).unsqueeze(0).to(device)


def patches(lm, image_bgr):
    """The photo's patch patterns (one row per small square of the image)."""
    import torch
    inner = lm.model
    inner.training = True          # in training mode PatchCore returns the patterns instead of a score
    try:
        with torch.no_grad():
            x = _tensor(image_bgr, lm)
            return inner(lm.pre_processor(x) if lm.pre_processor else x).detach()
    finally:
        inner.training = False
        inner.embedding_store.clear()


def new_patterns(bank, emb, k):
    """Pick up to k patterns from emb that are furthest from everything already in memory.

    Same idea PatchCore uses when it is first trained (greedy coreset), but measured against
    the existing memory, so only what is genuinely new gets added.
    """
    import torch
    nearest = torch.cat([torch.cdist(chunk, bank).min(1).values for chunk in emb.split(512)])
    floor = float(nearest.median())   # below this the pattern is already well covered
    picked = []
    for _ in range(k):
        i = int(nearest.argmax())
        if float(nearest[i]) <= floor:
            break
        picked.append(i)
        nearest = torch.minimum(nearest, torch.cdist(emb, emb[i:i + 1]).squeeze(1))
    return emb[picked]


def restore(anomaly_model):
    """At start-up, remember the original memory and load the version in use last time."""
    import torch
    if anomaly_model is None:
        return
    _original["bank"] = anomaly_model.model.model.memory_bank
    cur = VERSIONS / "current.json"
    if not cur.exists():
        return
    info = json.loads(cur.read_text())
    versions = [v for v in info.get("versions", []) if v["version"] == 1 or (VERSIONS / _file(v["version"])).exists()]
    listed = {v["version"] for v in versions}
    for f in sorted(VERSIONS.glob("memory_v*.pt"), key=lambda f: int(f.stem.split("_v")[1])):  # files saved before the list existed
        n = int(f.stem.split("_v")[1])
        if n not in listed:
            h = next((e for e in info.get("history", []) if e.get("version") == n and e.get("accepted")), {})
            versions.append({"version": n, "time": h.get("time"), "photos": h.get("photos", 0), "note": h.get("reason", "")})
    versions = sorted(versions, key=lambda v: v["version"])
    if not versions or versions[0]["version"] != 1:
        versions.insert(0, ORIGINAL)
    _set(history=info.get("history", []), versions=versions)
    if info["version"] != 1 and (VERSIONS / _file(info["version"])).exists():
        anomaly_model.model.model.memory_bank = torch.load(VERSIONS / _file(info["version"]), map_location="cpu")
        _set(version=info["version"])


def _file(version):
    return f"memory_v{version}.pt"


def _save_state():
    VERSIONS.mkdir(parents=True, exist_ok=True)
    with _lock:
        info = {"version": status["version"], "versions": status["versions"], "history": status["history"]}
    (VERSIONS / "current.json").write_text(json.dumps(info, indent=1))


def use(anomaly_model, version):
    """Switch inspection to another saved version (1 = the original model)."""
    import torch
    with _lock:
        if status["state"] == "running":
            raise ValueError("A retrain is running; switch when it has finished")
        known = {v["version"] for v in status["versions"]}
    if version not in known:
        raise ValueError(f"Version {version} is not saved")
    bank = _original["bank"] if version == 1 else torch.load(VERSIONS / _file(version), map_location="cpu")
    anomaly_model.model.model.memory_bank = bank
    _set(version=version)
    _save_state()


# ---------- exam ---------------------------------------------------------------------------

def _score(lm, image_bgr):
    import torch
    with torch.no_grad():
        return float(lm(_tensor(image_bgr, lm)).pred_score.flatten()[0])


def exam(lm, defect, good, step=None, done=0.0, share=1.0):
    total = len(defect) + len(good)
    caught = false_alarms = 0
    for n, p in enumerate(defect + good):
        img = cv2.imread(str(p))
        if img is None:
            continue
        flagged = _score(lm, img) >= config.ANOMALY_THRESHOLD
        if n < len(defect):
            caught += flagged
        else:
            false_alarms += flagged
        if step:
            _set(step=f"{step} ({n + 1}/{total} photos)", progress=round(done + share * (n + 1) / total, 3))
    return {"caught": caught, "defect": len(defect), "false_alarms": false_alarms, "good": len(good)}


def _names(defect, good):
    return tuple(p.name for p in defect + good)


def warm_up(anomaly_model):
    """Examine the current model in the background at start-up, so a live retrain is quicker."""
    def run():
        defect, good = exam_photos()
        key = (status["version"], _names(defect, good))
        if anomaly_model is not None and (defect or good) and key not in _baseline:
            with _lock:
                busy = status["state"] == "running"
            if not busy:
                _baseline[key] = exam(anomaly_model.model, defect, good)
    threading.Thread(target=run, daemon=True).start()


# ---------- the job ------------------------------------------------------------------------

def maybe_start(anomaly_model):
    """Called after every review. Starts a retrain once enough good photos are waiting."""
    if anomaly_model is None or len(waiting()) < config.RETRAIN_AFTER:
        return False
    with _lock:
        if status["state"] == "running":
            return False
        status.update(state="running", step="Starting", progress=0.0, error=None)
    threading.Thread(target=_run, args=(anomaly_model,), daemon=True).start()
    return True


def _device():
    """The graphics card if PyTorch can use one (retraining only; inspection stays on the CPU)."""
    import torch
    if config.RETRAIN_ON_GPU and torch.cuda.is_available():
        return "cuda", torch.cuda.get_device_name(0)
    return "cpu", "CPU"


def _run(anomaly_model):
    import torch
    device, name = _device()
    try:
        try:
            _retrain(anomaly_model, device, name)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            _retrain(anomaly_model, "cpu", "CPU (graphics card out of memory)")
    except Exception as err:   # never take the app down; show the problem on the dashboard
        _set(state="idle", step="", progress=0.0, error=f"Retraining failed: {err}")
    finally:
        if device == "cuda":
            torch.cuda.empty_cache()


def _retrain(anomaly_model, device="cpu", device_name="CPU"):
    import torch
    t0 = time.perf_counter()
    live = anomaly_model.model                      # keeps serving inspections on the CPU meanwhile
    photos = waiting()
    old_version = status["version"]
    defect, good = exam_photos()
    on = f" on {device_name}"

    # a private copy does all the work, on the graphics card when there is one
    _set(step=f"Loading the model{on}", progress=0.01)
    worker = copy.deepcopy(live).to(device)
    worker.eval()
    bank = worker.model.memory_bank

    # 1. the current model's exam (cached) and scores of the new photos
    imgs = [img for p in photos if (img := cv2.imread(str(p))) is not None]
    before = [_score(worker, img) for img in imgs]
    key = (old_version, _names(defect, good))
    if (defect or good) and key not in _baseline:
        _baseline[key] = exam(worker, defect, good, f"Exam: current model{on}", 0.05, 0.4)

    # 2. learn the new good parts
    _set(step=f"Learning {len(photos)} new good parts{on}", progress=0.45)
    added = []
    for img in imgs:
        added.append(new_patterns(torch.cat([bank, *added]), patches(worker, img), config.PATTERNS_PER_PHOTO))
    worker.model.memory_bank = torch.cat([bank, *added])
    candidate = worker
    after = [_score(candidate, img) for img in imgs]
    n_added = sum(len(a) for a in added)

    # 3. exam: old model against new model on the same photos
    if defect or good:
        old = _baseline[key]
        new = exam(candidate, defect, good, f"Exam: new model{on}", 0.5, 0.45)
        ok = new["caught"] >= old["caught"] - config.EXAM_TOLERANCE and new["false_alarms"] <= old["false_alarms"]
        why = (f"still catches {new['caught']}/{new['defect']} defect photos" if ok else
               f"would miss more defects ({new['caught']}/{new['defect']} instead of {old['caught']}/{old['defect']})")
        if ok and good:
            why += f", false alarms {old['false_alarms']} → {new['false_alarms']} of {new['good']} good photos"
        elif not ok and new["false_alarms"] > old["false_alarms"]:
            why = f"would raise more false alarms ({new['false_alarms']} instead of {old['false_alarms']})"
    else:
        old = new = None
        ok, why = True, "no exam photos found, so it was not checked"

    # 4. switch, or keep the old model
    version = max(v["version"] for v in status["versions"]) + 1 if ok else old_version
    if ok:
        VERSIONS.mkdir(parents=True, exist_ok=True)
        new_bank = candidate.model.memory_bank.cpu()
        torch.save(new_bank, VERSIONS / _file(version))
        live.model.memory_bank = new_bank                         # inspections use it from now on
        if new is not None:
            _baseline[(version, _names(defect, good))] = new
    LEARNED.parent.mkdir(parents=True, exist_ok=True)
    with open(LEARNED, "a") as fh:   # these photos are used, accepted or not
        fh.writelines(p.name + "\n" for p in photos)

    entry = {
        "time": datetime.now().isoformat(timespec="seconds"), "photos": len(photos),
        "patterns_added": n_added, "memory_size": int(candidate.model.memory_bank.shape[0]),
        "score_before": round(sum(before) / len(before), 3) if before else None,
        "score_after": round(sum(after) / len(after), 3) if after else None,
        "old": old, "new": new, "accepted": ok, "reason": why,
        "from_version": old_version, "version": version, "seconds": round(time.perf_counter() - t0, 1),
        "device": device_name,
    }
    history = ([entry] + status["history"])[:10]
    versions = status["versions"]
    if ok:
        versions = versions + [{"version": version, "time": entry["time"], "photos": len(photos),
                                "from_version": old_version, "note": why}]
        while len(versions) > KEEP + 1:                 # drop the oldest retrained version, never the original
            gone = versions.pop(1)
            (VERSIONS / _file(gone["version"])).unlink(missing_ok=True)
    new_log = not LOG.exists()
    with open(LOG, "a") as fh:
        if new_log:
            fh.write("time,photos,patterns_added,score_before,score_after,accepted,version,seconds,reason\n")
        fh.write(f"{entry['time']},{entry['photos']},{n_added},{entry['score_before']},{entry['score_after']},"
                 f"{ok},{version},{entry['seconds']},\"{why}\"\n")
    _set(state="idle", step="", progress=1.0, version=version, history=history, versions=versions)
    _save_state()
    maybe_start(anomaly_model)   # more photos may have arrived meanwhile
