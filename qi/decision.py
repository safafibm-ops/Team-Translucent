"""Combines both models into one pass / review / reject decision with a severity level."""
from . import config


def severity(box):
    """Rule-based severity: defect type + size + confidence. Rules are easy for QA to read and tune."""
    pts = config.BASE_POINTS.get(box["category"], 1)
    if box["area_pct"] > 2:
        pts += 1
    if box["confidence"] > 0.8:
        pts += 0.5
    if box["category"] == "crack":
        pts = max(pts, 3)          # a crack is never below High
    level = config.LEVELS[min(3, max(0, int(pts) - 1))]
    return level


def inspect(image_bgr, defect_model, anomaly_model=None, conf=config.DEFECT_CONF,
            sure=config.SURE_DEFECT, anomaly_threshold=config.ANOMALY_THRESHOLD):
    """Defect model first; the anomaly model only runs when no confident defect was found."""
    boxes, boxed_img, d_ms = defect_model.run(image_bgr, conf=conf)
    for b in boxes:
        b["severity"] = severity(b)
    result = {"boxes": boxes, "boxed_image": boxed_img, "defect_ms": round(d_ms, 1),
              "anomaly_score": None, "heatmap": None, "anomaly_ms": None}

    sure_boxes = [b for b in boxes if b["confidence"] >= sure]
    if not sure_boxes and anomaly_model is not None:
        score, heat, a_ms = anomaly_model.run(image_bgr)
        result.update(anomaly_score=round(score, 3), heatmap=heat, anomaly_ms=round(a_ms, 1))

    score = result["anomaly_score"]
    if sure_boxes:
        decision, reason = "REJECT", "Known defect found by the defect model"
    elif boxes and score is not None and score >= anomaly_threshold:
        decision, reason = "REJECT", "Weak defect box confirmed by the anomaly model"
    elif score is not None and score >= anomaly_threshold:
        decision, reason = "REVIEW", "Looks unlike a good part, but no known defect: send to a person"
    elif boxes:
        decision, reason = "REVIEW", "Weak defect box only: send to a person"
    else:
        decision, reason = "PASS", "No defect found"

    order = {lvl: i for i, lvl in enumerate(config.LEVELS)}
    worst = max((b["severity"] for b in boxes), key=lambda s: order[s], default=None)
    if decision == "REVIEW" and worst is None:
        worst = "Medium"
    main = max(boxes, key=lambda b: (order[b["severity"]], b["confidence"]), default=None)
    result.update(decision=decision, reason=reason, severity=worst,
                  main_category=main["category"] if main else ("unknown" if decision != "PASS" else "none"),
                  main_defect=main["defect"] if main else None)
    return result
