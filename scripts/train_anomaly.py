"""Train the ANOMALY model (learns only GOOD parts, then paints anything unusual red).

Run from the casting-qi folder:
    python scripts/train_anomaly.py --data data/kaggle            (300 good parts, quick)
    python scripts/train_anomaly.py --data data/kaggle --n-train 3000   (all ~2,875 good parts)

--data is the folder you unzipped the Kaggle casting dataset into. The script finds the
ok_front / def_front folders inside it by itself.

Model: PatchCore. It does not "learn" with epochs like the defect model; it stores small
patches of good parts in a memory bank, then scores each patch of a new photo by how far
it is from the closest good patch. Far = red on the heat-map.

Memory: every good photo gives 1,024 patches (6 MB on the GPU). All 2,875 photos would need
~18 GB, more than a laptop GPU has, so each photo keeps only a random share of its patches
(--patch-keep, set automatically). The final memory bank is then trimmed to about --bank
patches (default 15,000), which is what keeps CPU inference fast.

Results land in results/anomaly/ (scores printed at the end, example heat-maps in images/).
"""
import argparse
import random
import shutil
from pathlib import Path

import torch

from anomalib.data import Folder
from anomalib.engine import Engine
from anomalib.models import Patchcore

IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def find_dir(root, *parts):
    """Find e.g. .../train/ok_front anywhere under root (Kaggle zips nest folders twice)."""
    pattern = "/".join(parts)
    hits = [p for p in root.rglob(parts[-1]) if p.is_dir() and p.as_posix().endswith(pattern)]
    if not hits:
        raise SystemExit(f"Could not find a '{pattern}' folder under {root}")
    return hits[0]


def pick(src, dst, n, seed):
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in IMG_EXT)
    random.Random(seed).shuffle(files)
    dst.mkdir(parents=True, exist_ok=True)
    for p in files[:n]:
        shutil.copy2(p, dst / p.name)
    return min(n, len(files))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/kaggle")
    ap.add_argument("--n-train", type=int, default=300,
                    help="good images to learn from; 300 is plenty and keeps memory use low")
    ap.add_argument("--n-test", type=int, default=150, help="good and defective test images each")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--patch-keep", type=float, default=None,
                    help="share of each photo's patches to store; default: enough for ~300 photos' worth")
    ap.add_argument("--bank", type=int, default=15000,
                    help="memory bank size after trimming; bigger = slower on CPU")
    ap.add_argument("--coreset", type=float, default=None,
                    help="share of stored patches kept in the bank; overrides --bank if given")
    ap.add_argument("--no-pretrained", action="store_true",
                    help="only for testing without internet; results will be poor")
    a = ap.parse_args()
    root = Path(a.data)

    # build a small, clean folder: train/good, test/good, test/defect
    work = Path("data/anomaly_set")
    if work.exists():
        shutil.rmtree(work)
    n_tr = pick(find_dir(root, "train", "ok_front"), work / "train_good", a.n_train, a.seed)
    n_tg = pick(find_dir(root, "test", "ok_front"), work / "test_good", a.n_test, a.seed)
    n_td = pick(find_dir(root, "test", "def_front"), work / "test_defect", a.n_test, a.seed)
    print(f"Learning from {n_tr} good parts; testing on {n_tg} good + {n_td} defective.")

    keep = a.patch_keep or min(1.0, 300 / max(n_tr, 1))
    stored = int(n_tr * 1024 * keep)   # 32x32 patches per 256x256 photo
    coreset = a.coreset or min(1.0, a.bank / max(stored, 1))
    print(f"Storing {keep:.0%} of each photo's patches (~{stored:,}), "
          f"then keeping {coreset:.1%} of them (~{int(stored * coreset):,} in the memory bank).")

    data = Folder(name="casting", root=work, normal_dir="train_good", normal_test_dir="test_good",
                  abnormal_dir="test_defect", train_batch_size=16, eval_batch_size=16,
                  num_workers=a.workers, seed=a.seed)
    model = Patchcore(coreset_sampling_ratio=coreset, pre_trained=not a.no_pretrained)   # keep a share of good patches: fewer = faster on CPU
    torch.manual_seed(a.seed)

    def keep_some_patches(module, inputs, output):
        # after each training batch, keep only a random share of its patches to save GPU memory
        if module.training and keep < 1.0 and module.embedding_store:
            emb = module.embedding_store[-1]
            idx = torch.randperm(emb.shape[0], device=emb.device)[: max(1, int(emb.shape[0] * keep))]
            module.embedding_store[-1] = emb[idx]

    model.model.register_forward_hook(keep_some_patches)
    engine = Engine(default_root_dir="results/anomaly", max_epochs=1)
    engine.fit(model=model, datamodule=data)
    print("\nScores on test parts (image_AUROC near 1.0 = separates good from defective almost perfectly):")
    engine.test(model=model, datamodule=data)
    print("\nModel saved under results/anomaly/. Heat-map examples are in its 'images' folder.")


if __name__ == "__main__":
    main()
