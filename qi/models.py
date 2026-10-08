"""Loads the two trained models and runs them on one image."""
import time
from pathlib import Path

import numpy as np

from . import config


class DefectModel:
    """YOLO defect detector: names known defects and draws boxes."""

    def __init__(self, path):
        from ultralytics import YOLO
        self.path = Path(path)
        self.model = YOLO(str(self.path), task="detect")

    def run(self, image_bgr, conf=config.DEFECT_CONF):
        t = time.perf_counter()
        r = self.model.predict(image_bgr, conf=conf, iou=0.5, device="cpu", verbose=False)[0]
        ms = (time.perf_counter() - t) * 1000
        h, w = image_bgr.shape[:2]
        boxes = []
        for xyxy, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            name = r.names[int(k)]
            x1, y1, x2, y2 = xyxy
            boxes.append({
                "defect": name,
                "category": config.CATEGORY.get(name.lower(), "other"),
                "confidence": round(c, 3),
                "box": [round(v) for v in xyxy],
                "area_pct": round(100 * (x2 - x1) * (y2 - y1) / (w * h), 2),
            })
        return boxes, r.plot(), ms


class AnomalyModel:
    """PatchCore anomaly model: learned only from good parts, gives a score and a heat-map."""

    def __init__(self, path):
        import torch
        from anomalib.models import Patchcore
        self.torch = torch
        self.model = Patchcore.load_from_checkpoint(str(path), map_location="cpu", pre_trained=False)  # weights are in the file, no download
        self.model.eval()

    def run(self, image_bgr):
        import cv2
        torch = self.torch
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        x = torch.from_numpy(rgb).permute(2, 0, 1).float().div(255).unsqueeze(0)
        t = time.perf_counter()
        with torch.no_grad():
            out = self.model(x)
        ms = (time.perf_counter() - t) * 1000
        score = float(out.pred_score.flatten()[0])
        amap = out.anomaly_map.squeeze().cpu().numpy()
        return score, heatmap_overlay(image_bgr, amap), ms


def heatmap_overlay(image_bgr, amap):
    import cv2
    amap = cv2.resize(amap.astype(np.float32), (image_bgr.shape[1], image_bgr.shape[0]))
    amap = (amap - amap.min()) / (amap.max() - amap.min() + 1e-8)
    color = cv2.applyColorMap((amap * 255).astype(np.uint8), cv2.COLORMAP_JET)
    return cv2.addWeighted(image_bgr, 0.6, color, 0.4, 0)
