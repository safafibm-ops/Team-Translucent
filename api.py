"""Inspection service (FastAPI) and the React dashboard it serves.

Run:  uvicorn api:app --port 8000
Open: http://localhost:8000      (dashboard)
      http://localhost:8000/docs (API docs)
"""
import base64
import csv
import hashlib
import itertools
import json
import threading
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from qi import config
from qi import retrain
from qi.decision import inspect
from qi.process import RootCause, early_warning, reading_for, simulate_good_scores, simulate_history

ROOT = Path(__file__).parent
DIST = ROOT / "web" / "dist"
DATA = ROOT / "data"
PENDING = DATA / "review" / "pending"
LABELS = DATA / "labels"
RULES = DATA / "rules.json"
DEFAULT_RULES = {"ignore_below": config.DEFECT_CONF, "reject_above": config.SURE_DEFECT,
                 "anomaly_review": config.ANOMALY_THRESHOLD}

app = FastAPI(title="Casting Quality Inspection API", version="2.0")
state = {"log": [], "review": {}, "review_images": {}, "labels": 0, "work_orders": 0}
lock = threading.Lock()
ids = itertools.count(1)


@app.on_event("startup")
def load():
    from qi.models import AnomalyModel, DefectModel
    state["defect"] = DefectModel(config.DEFECT_MODEL) if Path(config.DEFECT_MODEL).exists() else None
    state["anomaly"] = AnomalyModel(config.ANOMALY_MODEL) if Path(config.ANOMALY_MODEL).exists() else None
    hist = simulate_history()
    hist["time"] += pd.Timestamp.now().floor("min") - hist["time"].max()   # simulated history ends now
    state["history"] = hist
    state["rc"] = RootCause(hist)
    state["scores"] = simulate_good_scores(hist)
    state["rules"] = dict(DEFAULT_RULES)
    if RULES.exists():
        state["rules"].update(json.loads(RULES.read_text()))
    retrain.restore(state["anomaly"])
    retrain.warm_up(state["anomaly"])
    PENDING.mkdir(parents=True, exist_ok=True)
    if (LABELS / "labels.csv").exists():
        state["labels"] = sum(1 for _ in open(LABELS / "labels.csv")) - 1


def _b64(img, width=None):
    if width and img.shape[1] > width:
        img = cv2.resize(img, (width, int(img.shape[0] * width / img.shape[1])))
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode() if ok else None


@app.get("/health")
def health():
    return {"defect_model": state.get("defect") is not None, "anomaly_model": state.get("anomaly") is not None}


@app.post("/inspect")
async def inspect_part(file: UploadFile = File(...)):
    """Check one part photo: decision, severity, boxes, heat-map, likely cause."""
    if state.get("defect") is None:
        raise HTTPException(503, "Defect model not found in models/defect/best.pt")
    raw = await file.read()
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Not an image")
    rules = state["rules"]
    res = inspect(img, state["defect"], state["anomaly"], conf=rules["ignore_below"],
                  sure=rules["reject_above"], anomaly_threshold=rules["anomaly_review"])
    seed = int(hashlib.md5(file.filename.encode()).hexdigest()[:8], 16)
    reading = reading_for(res["main_category"], seed)
    cause = state["rc"].explain(reading, res["main_category"]) if res["decision"] != "PASS" else None
    now = datetime.now()
    pid = next(ids)
    cpu_ms = round(res["defect_ms"] + (res["anomaly_ms"] or 0), 1)
    out = {
        "id": pid, "part": file.filename, "time": now.isoformat(timespec="seconds"),
        "decision": res["decision"], "reason": res["reason"], "severity": res["severity"],
        "main_defect": res["main_defect"], "category": res["main_category"],
        "defects": res["boxes"], "anomaly_score": res["anomaly_score"],
        "cpu_ms": {"defect": res["defect_ms"], "anomaly": res["anomaly_ms"], "total": cpu_ms},
        "machine": reading["machine"], "batch": reading["batch"], "root_cause": cause,
        "boxed_image": _b64(res["boxed_image"], 900),
        "heatmap": _b64(res["heatmap"], 900) if res["heatmap"] is not None else None,
    }
    with lock:
        state["log"].append({k: out[k] for k in ("id", "part", "time", "decision", "severity", "main_defect",
                                                  "category", "machine", "batch", "anomaly_score")} | {"cpu_ms": cpu_ms})
        if res["decision"] == "REVIEW":
            (PENDING / f"{pid}_{Path(file.filename).name}").write_bytes(raw)
            state["review"][pid] = {"id": pid, "part": file.filename, "time": out["time"],
                                    "machine": reading["machine"], "reason": res["reason"],
                                    "main_defect": res["main_defect"], "anomaly_score": res["anomaly_score"],
                                    "confidence": max((b["confidence"] for b in res["boxes"]), default=None),
                                    "severity": res["severity"], "defects": res["boxes"],
                                    "thumb": _b64(res["heatmap"] if res["heatmap"] is not None else res["boxed_image"], 320)}
            # full-size pictures for the reviewer (fetched only when the part is opened)
            state["review_images"][pid] = {"photo": _b64(img, 1600), "boxes": _b64(res["boxed_image"], 1600),
                                           "heatmap": _b64(res["heatmap"], 1600) if res["heatmap"] is not None else None}
        if res["decision"] == "PASS" and res["anomaly_score"] is not None:
            # a good part's score feeds the early-warning trend of its machine
            state["scores"] = pd.concat([state["scores"], pd.DataFrame(
                [{"machine": reading["machine"], "time": pd.Timestamp(now), "score": res["anomaly_score"], "live": True}])],
                ignore_index=True)
    return out


@app.get("/summary")
def summary():
    """Numbers for the top row of the dashboard (this session's inspections)."""
    log = state["log"]
    n = len(log)
    passed = sum(r["decision"] == "PASS" and not r.get("reviewed") for r in log)   # first pass = no person needed
    rejected = [r for r in log if r["decision"] == "REJECT"]
    by_cat = pd.Series([r["category"] for r in rejected]).value_counts().to_dict() if rejected else {}
    return {
        "inspected": n,
        "first_pass_yield": round(100 * passed / n, 1) if n else None,
        "rejected": len(rejected), "rejected_by_type": by_cat,
        "waiting_review": len(state["review"]),
        "avg_check_ms": round(float(np.mean([r["cpu_ms"] for r in log])), 1) if n else None,
        "labels_saved": state["labels"], "work_orders": state["work_orders"],
        "reviewed": sum(bool(r.get("reviewed")) for r in log),
    }


@app.get("/inspections")
def inspections(limit: int = 50):
    return state["log"][-limit:][::-1]


@app.get("/review")
def review_queue():
    """Parts the system was unsure about, waiting for a person."""
    return sorted(state["review"].values(), key=lambda r: r["id"])


@app.get("/review/{pid}/images")
def review_images(pid: int):
    """Large photo, defect boxes and heat-map of one part, for the reviewer."""
    if pid not in state["review_images"]:
        raise HTTPException(404, "Not in the review queue")
    return state["review_images"][pid]


class Label(BaseModel):
    label: str   # "pass" (good part) or "reject" (defective)


@app.post("/review/{pid}")
def review_label(pid: int, body: Label):
    """A person's decision. The photo is filed under labels/good or labels/defect for retraining."""
    if body.label not in ("pass", "reject"):
        raise HTTPException(400, "label must be 'pass' or 'reject'")
    with lock:
        item = state["review"].pop(pid, None)
        state["review_images"].pop(pid, None)
        if item is None:
            raise HTTPException(404, "Not in the review queue")
        folder = LABELS / ("good" if body.label == "pass" else "defect")
        folder.mkdir(parents=True, exist_ok=True)
        for f in PENDING.glob(f"{pid}_*"):
            f.replace(folder / f.name)
        new = not (LABELS / "labels.csv").exists()
        with open(LABELS / "labels.csv", "a", newline="") as fh:
            w = csv.writer(fh)
            if new:
                w.writerow(["time", "part", "machine", "model_said", "person_said"])
            w.writerow([datetime.now().isoformat(timespec="seconds"), item["part"], item["machine"],
                        "REVIEW", body.label])
        state["labels"] += 1
        final = "PASS" if body.label == "pass" else "REJECT"
        for r in state["log"]:
            if r["id"] == pid:
                r.update(decision=final, reviewed=True)
    started = body.label == "pass" and retrain.maybe_start(state.get("anomaly"))
    return {"ok": True, "id": pid, "decision": final, "labels_saved": state["labels"],
            "waiting_review": len(state["review"]), "retrain_started": started}


@app.get("/retrain")
def retrain_status():
    """Anomaly model self-learning: good photos waiting, job progress, and past retrains."""
    return retrain.view()


class Version(BaseModel):
    version: int


@app.post("/retrain/use")
def retrain_use(body: Version):
    """Switch the anomaly model to another saved version (1 = the original model)."""
    if state.get("anomaly") is None:
        raise HTTPException(503, "Anomaly model not loaded")
    try:
        retrain.use(state["anomaly"], body.version)
    except ValueError as err:
        raise HTTPException(409, str(err))
    return retrain.view()


@app.post("/retrain")
def retrain_now():
    """Start a retrain now if enough confirmed good photos are waiting (it also starts on its own)."""
    if not retrain.maybe_start(state.get("anomaly")):
        v = retrain.view()
        raise HTTPException(409, "Already running" if v["state"] == "running"
                            else f"{v['waiting']} of {v['needed']} good photos waiting")
    return retrain.view()


@app.get("/early-warning")
def early_warning_view():
    """Good-part anomaly score per machine over time, with a forecast to the reject limit."""
    limit = state["rules"]["anomaly_review"]
    return {"warning_level": config.WARNING_LEVEL, "limit": limit,
            "machines": early_warning(state["scores"], config.WARNING_LEVEL, limit)}


class Rules(BaseModel):
    ignore_below: float     # defect boxes less sure than this are ignored
    reject_above: float     # a defect box at least this sure rejects the part without a person
    anomaly_review: float   # anomaly score at or above this means "unlike a good part"


@app.get("/rules")
def get_rules():
    """When a part is passed, rejected or sent to a person (the review range)."""
    return state["rules"] | {"defaults": DEFAULT_RULES}


@app.post("/rules")
def set_rules(body: Rules):
    """Change the review range. Applies to the next inspected part and is kept after a restart."""
    if not 0.05 <= body.ignore_below < body.reject_above <= 0.95:
        raise HTTPException(400, "Need 0.05 <= ignore_below < reject_above <= 0.95")
    if not 0.1 <= body.anomaly_review <= 0.9:
        raise HTTPException(400, "anomaly_review must be between 0.1 and 0.9")
    state["rules"] = {k: round(v, 2) for k, v in body.model_dump().items()}
    DATA.mkdir(exist_ok=True)
    RULES.write_text(json.dumps(state["rules"]))
    return get_rules()


@app.get("/machines/risk")
def machine_risk():
    return state["rc"].risk(state["history"]).to_dict(orient="records")


class WorkOrder(BaseModel):
    machine: str
    action: str
    part: str | None = None


@app.post("/work-orders")
def work_order(body: WorkOrder):
    """Log a maintenance request (a real plant would send this to its maintenance system)."""
    DATA.mkdir(exist_ok=True)
    path = DATA / "work_orders.csv"
    new = not path.exists()
    with lock:
        with open(path, "a", newline="") as fh:
            w = csv.writer(fh)
            if new:
                w.writerow(["time", "machine", "part", "action"])
            w.writerow([datetime.now().isoformat(timespec="seconds"), body.machine, body.part or "", body.action])
        state["work_orders"] += 1
        return {"ok": True, "work_order": f"WO-{state['work_orders']:04d}"}


@app.middleware("http")
async def fresh_page(request, call_next):
    """The browser always re-checks the page, so a rebuilt dashboard shows up without a hard refresh."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache"
    return response


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="ui")
else:
    @app.get("/", response_class=HTMLResponse)
    def no_ui():
        return "<p>Dashboard not built. See README (web/dist missing). API docs: <a href='/docs'>/docs</a></p>"
