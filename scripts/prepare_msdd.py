"""Turn the MSDD download into the folder layout YOLO trains on.

Run from the casting-qi folder:
    python scripts/prepare_msdd.py --src data/msdd --out data/msdd_yolo

What it does
  1. Finds every annotation file (*.xml, Pascal VOC format) and its matching image.
  2. Renames MSDD's 8 defect names to the 7 names in the hackathon brief (CLASS_MAP below).
  3. Converts each box to YOLO's text format: class x_centre y_centre width height (all 0-1).
  4. Splits into train / val / test by capture date, so near-identical photos of the same part
     never end up in both training and test (that would be "leakage" and fake a high score).
  5. Writes data/msdd_yolo/data.yaml, the file the training script reads.
"""
import argparse
import collections
import random
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

# MSDD name (lower case, spaces/underscores/hyphens removed) -> brief class
CLASS_MAP = {
    "partinglinecrack": "crack",
    "crack": "crack",
    "mouldscuffing": "scratch",
    "moldscuffing": "scratch",
    "cutmarks": "scratch",
    "cutmark": "scratch",
    "scratch": "scratch",
    "dent": "dent",
    "pockmarks": "porosity",
    "pockmark": "porosity",
    "porosity": "porosity",
    "misrun": "deformation",
    "stampcollapse": "deformation",
    "inclusion": "other",
}
CLASSES = ["crack", "scratch", "dent", "corrosion", "porosity", "deformation", "other"]  # brief's order
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff")


def norm(name):
    return re.sub(r"[\s_\-]", "", name.strip().lower())


def find_image(xml_path, root, image_index):
    tree = ET.parse(xml_path)
    fname = (tree.findtext("filename") or "").strip()
    stem = Path(fname).stem if fname else xml_path.stem
    for key in (fname.lower(), stem.lower(), xml_path.stem.lower()):
        if key in image_index:
            return image_index[key]
    return None


def group_key(path, level):
    """Capture-time group from the file name (e.g. 20230914_1030...): level 'day' or 'hour'.

    Photos taken minutes apart are often the same part, so they must stay in one split.
    """
    m = re.search(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_T ]?(\d{2})?", path.stem)
    if not m or level == "file":
        return path.stem
    day = "".join(m.groups()[:3])
    return day if level == "day" or not m.group(4) else day + m.group(4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="data/msdd", help="folder you unzipped MSDD into")
    ap.add_argument("--out", default="data/msdd_yolo")
    ap.add_argument("--val", type=float, default=0.15)
    ap.add_argument("--test", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--max-background", type=int, default=1500,
                    help="defect-free images to keep (teaches the model what normal looks like)")
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)

    xmls = sorted(p for p in src.rglob("*.xml"))
    if not xmls:
        raise SystemExit(f"No .xml annotation files under {src}. Did you unzip the Annotations folder there?")
    images = [p for p in src.rglob("*") if p.suffix.lower() in IMG_EXT and "origimages" not in str(p).lower()]
    index = {}
    for p in images:
        index.setdefault(p.name.lower(), p)
        index.setdefault(p.stem.lower(), p)
    print(f"Found {len(xmls)} annotation files and {len(images)} images (raw single-light images skipped).")

    samples, unknown, counts, used_images = [], collections.Counter(), collections.Counter(), set()
    for x in xmls:
        img = find_image(x, src, index)
        if img is None:
            continue
        root = ET.parse(x).getroot()
        w = float(root.findtext("size/width") or 0)
        h = float(root.findtext("size/height") or 0)
        if not w or not h:
            from PIL import Image
            with Image.open(img) as im:
                w, h = im.size
        lines = []
        for obj in root.iter("object"):
            raw = obj.findtext("name") or ""
            cls = CLASS_MAP.get(norm(raw))
            if cls is None:
                unknown[raw] += 1
                continue
            bb = obj.find("bndbox")
            x0, y0, x1, y1 = (float(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
            x0, x1 = max(0, min(x0, x1)), min(w, max(x0, x1))
            y0, y1 = max(0, min(y0, y1)), min(h, max(y0, y1))
            if x1 - x0 < 1 or y1 - y0 < 1:
                continue
            lines.append(f"{CLASSES.index(cls)} {(x0 + x1) / 2 / w:.6f} {(y0 + y1) / 2 / h:.6f} "
                         f"{(x1 - x0) / w:.6f} {(y1 - y0) / h:.6f}")
            counts[cls] += 1
        samples.append((img, lines))
        used_images.add(img)

    # defect-free images (no xml, or xml with no objects) become "background" examples
    rng = random.Random(a.seed)
    background = [p for p in images if p not in used_images]
    rng.shuffle(background)
    samples += [(p, []) for p in background[:a.max_background]]

    # split by capture date group
    # coarsest grouping that still leaves at least 20 groups to split
    for level in ("day", "hour", "file"):
        groups = sorted({group_key(p, level) for p, _ in samples})
        if len(groups) >= 20:
            break
    print(f"Splitting by capture {level}.")
    rng.shuffle(groups)
    n = len(groups)
    n_test, n_val = max(1, int(n * a.test)), max(1, int(n * a.val))
    split_of = {g: "test" for g in groups[:n_test]}
    split_of.update({g: "val" for g in groups[n_test:n_test + n_val]})
    if out.exists():
        shutil.rmtree(out)
    per_split = collections.Counter()
    for img, lines in samples:
        s = split_of.get(group_key(img, level), "train")
        (out / "images" / s).mkdir(parents=True, exist_ok=True)
        (out / "labels" / s).mkdir(parents=True, exist_ok=True)
        name = f"{img.parent.name}_{img.name}"
        shutil.copy2(img, out / "images" / s / name)
        (out / "labels" / s / (Path(name).stem + ".txt")).write_text("\n".join(lines))
        per_split[s] += 1

    (out / "data.yaml").write_text(
        f"path: {out.resolve().as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        "names:\n" + "".join(f"  {i}: {c}\n" for i, c in enumerate(CLASSES)))

    print(f"\nCapture-date groups: {n} (test {n_test}, val {n_val}, rest train)")
    print("Images per split:", dict(per_split))
    print("Boxes per class:", {c: counts.get(c, 0) for c in CLASSES})
    if unknown:
        print("\nWARNING: these MSDD names were not mapped and were skipped:", dict(unknown))
        print("Add them to CLASS_MAP at the top of this file and run again.")
    if level == "file":
        print("\nNote: no usable capture times in file names, so photos were split one by one. Tell Claude.")
    print(f"\nDone. Next: python scripts/train_defect.py --data {out / 'data.yaml'}")


if __name__ == "__main__":
    main()
