"""Inspection service (FastAPI). Same qi/ logic as the Streamlit app, exposed as an API.

Run:  uvicorn api:app --port 8000
Open: http://localhost:8000      (web page)
      http://localhost:8000/docs (API docs)
"""
import base64
import hashlib
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from qi import config
from qi.decision import inspect
from qi.process import RootCause, reading_for, simulate_history

app = FastAPI(title="Casting Quality Inspection API", version="1.0")
state = {}


@app.on_event("startup")
def load():
    from qi.models import AnomalyModel, DefectModel
    state["defect"] = DefectModel(config.DEFECT_MODEL) if Path(config.DEFECT_MODEL).exists() else None
    state["anomaly"] = AnomalyModel(config.ANOMALY_MODEL) if Path(config.ANOMALY_MODEL).exists() else None
    state["history"] = simulate_history()
    state["rc"] = RootCause(state["history"])


def _b64(img):
    ok, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode() if ok else None


@app.get("/")
def page():
    return FileResponse(Path(__file__).parent / "web" / "index.html")


@app.get("/health")
def health():
    return {"defect_model": state.get("defect") is not None, "anomaly_model": state.get("anomaly") is not None}


@app.post("/inspect")
async def inspect_part(file: UploadFile = File(...)):
    if state.get("defect") is None:
        raise HTTPException(503, "Defect model not found in models/defect/best.pt")
    img = cv2.imdecode(np.frombuffer(await file.read(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Not an image")
    res = inspect(img, state["defect"], state["anomaly"])
    seed = int(hashlib.md5(file.filename.encode()).hexdigest()[:8], 16)
    reading = reading_for(res["main_category"], seed)
    cause = state["rc"].explain(reading, res["main_category"]) if res["decision"] != "PASS" else None
    return {
        "part": file.filename, "decision": res["decision"], "reason": res["reason"], "severity": res["severity"],
        "defects": res["boxes"], "anomaly_score": res["anomaly_score"],
        "cpu_ms": {"defect": res["defect_ms"], "anomaly": res["anomaly_ms"]},
        "machine": reading["machine"], "batch": reading["batch"], "root_cause": cause,
        "boxed_image": _b64(res["boxed_image"]),
        "heatmap": _b64(res["heatmap"]) if res["heatmap"] is not None else None,
    }


@app.get("/machines/risk")
def machine_risk():
    return state["rc"].risk(state["history"]).to_dict(orient="records")
