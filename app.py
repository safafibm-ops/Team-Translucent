"""Casting quality inspection dashboard.

Run:  streamlit run app.py
"""
import hashlib
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import streamlit as st

from qi import config
from qi.decision import inspect
from qi.process import RootCause, reading_for, simulate_history

st.set_page_config(page_title="Casting Quality Inspection", layout="wide")


@st.cache_resource
def load_defect(path):
    from qi.models import DefectModel
    return DefectModel(path)


@st.cache_resource
def load_anomaly(path):
    from qi.models import AnomalyModel
    return AnomalyModel(path)


@st.cache_resource
def load_analytics():
    hist = simulate_history()
    return hist, RootCause(hist)


# ---------- sidebar ----------
st.sidebar.title("Settings")
defect_path = st.sidebar.text_input("Defect model (best.pt or OpenVINO folder)", str(config.DEFECT_MODEL))
anomaly_path = st.sidebar.text_input("Anomaly model (model.ckpt)", str(config.ANOMALY_MODEL))
conf = st.sidebar.slider("Show defect boxes above", 0.1, 0.9, config.DEFECT_CONF, 0.05)
sure = st.sidebar.slider("Confident defect (skip anomaly model) above", 0.3, 0.95, config.SURE_DEFECT, 0.05)
a_thr = st.sidebar.slider("Anomaly score limit", 0.1, 0.9, config.ANOMALY_THRESHOLD, 0.05)
st.sidebar.caption("Everything runs on the CPU. No GPU needed.")

defect_model = anomaly_model = None
if Path(defect_path).exists():
    defect_model = load_defect(defect_path)
else:
    st.sidebar.error("Defect model not found. Put best.pt in models/defect/.")
if Path(anomaly_path).exists():
    try:
        anomaly_model = load_anomaly(anomaly_path)
    except Exception as e:
        st.sidebar.warning(f"Anomaly model could not load: {e}")
else:
    st.sidebar.info("Anomaly model not found, running with the defect model only.")

history, rc = load_analytics()
if "log" not in st.session_state:
    st.session_state.log = []

st.title("Casting Quality Inspection")
st.caption("Defect model (YOLO11) + anomaly model (PatchCore) → decision, severity, root cause, risk")

tab_inspect, tab_line, tab_about = st.tabs(["Inspect parts", "Line dashboard", "How it works"])

COLORS = {"PASS": "#1b8a3a", "REVIEW": "#c98a00", "REJECT": "#c62828"}

# ---------- inspect ----------
with tab_inspect:
    files = st.file_uploader("Upload part photos", type=["jpg", "jpeg", "png", "bmp"], accept_multiple_files=True)
    folder = st.text_input("…or a folder of photos (e.g. data/casting_rf/test/images)", "")
    max_n = st.number_input("Max photos from folder", 1, 200, 10)
    go = st.button("Inspect", type="primary", disabled=defect_model is None)

    items = []
    if go:
        for f in files or []:
            items.append((f.name, cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_COLOR)))
        if folder and Path(folder).is_dir():
            for p in sorted(Path(folder).glob("*"))[: int(max_n)]:
                if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp"):
                    items.append((p.name, cv2.imread(str(p))))
        if not items:
            st.warning("Add photos first.")

    for name, img in items:
        if img is None:
            continue
        res = inspect(img, defect_model, anomaly_model, conf=conf, sure=sure, anomaly_threshold=a_thr)
        seed = int(hashlib.md5(name.encode()).hexdigest()[:8], 16)
        reading = reading_for(res["main_category"], seed)
        cause = rc.explain(reading, res["main_category"]) if res["decision"] != "PASS" else None

        st.divider()
        c1, c2, c3 = st.columns([1.1, 1.1, 1.3])
        c1.image(cv2.cvtColor(res["boxed_image"], cv2.COLOR_BGR2RGB), caption=f"{name}: defect model",
                 width="stretch")
        if res["heatmap"] is not None:
            c2.image(cv2.cvtColor(res["heatmap"], cv2.COLOR_BGR2RGB),
                     caption=f"Anomaly heat-map (score {res['anomaly_score']})", width="stretch")
        else:
            c2.info("Anomaly model skipped: the defect model was already sure."
                    if res["boxes"] else "Anomaly model not loaded.")
        with c3:
            col = COLORS[res["decision"]]
            st.markdown(f"<h2 style='color:{col};margin:0'>{res['decision']}</h2>", unsafe_allow_html=True)
            st.write(res["reason"])
            if res["severity"]:
                st.metric("Severity", res["severity"])
            t = f"Defect model {res['defect_ms']} ms"
            if res["anomaly_ms"] is not None:
                t += f" · anomaly model {res['anomaly_ms']} ms"
            st.caption(f"Time on CPU: {t}")
            if res["boxes"]:
                st.dataframe(pd.DataFrame(res["boxes"])[["defect", "category", "confidence", "area_pct", "severity"]],
                             hide_index=True, width="stretch")
            if cause:
                st.markdown(f"**Machine {reading['machine']}, batch {reading['batch']}** (simulated readings)")
                st.write(f"Likely cause, confidence {cause['confidence']:.0%}:")
                for c in cause["causes"]:
                    st.write(f"- **{c['factor'].replace('_', ' ')}** is {c['direction']}: "
                             f"{c['value']} {c['unit']} (normal ≈ {c['normal']})  \n  → {c['action']}")
                if not cause["causes"]:
                    st.write("- No single process reading stands out. Check handling and the die surface.")

        st.session_state.log.append({
            "part": name, "decision": res["decision"], "severity": res["severity"] or "",
            "defect": res["main_defect"] or ("unknown" if res["decision"] == "REVIEW" else ""),
            "category": res["main_category"], "machine": reading["machine"], "batch": reading["batch"],
            "anomaly_score": res["anomaly_score"], "cpu_ms": res["defect_ms"] + (res["anomaly_ms"] or 0),
        })

# ---------- line dashboard ----------
with tab_line:
    log = pd.DataFrame(st.session_state.log)
    k1, k2, k3, k4 = st.columns(4)
    n = len(log)
    k1.metric("Parts inspected", n)
    k2.metric("Rejected", int((log["decision"] == "REJECT").sum()) if n else 0)
    k3.metric("Sent to review", int((log["decision"] == "REVIEW").sum()) if n else 0)
    k4.metric("Critical defects", int((log["severity"] == "Critical").sum()) if n else 0)

    risk = rc.risk(history)
    st.subheader("Which machine is likely to make defects next")
    st.caption("Predicted risk from each machine's last 100 parts (simulated readings). "
               "SPC alarm = recent defect rate above its normal level by more than 3 sigma.")
    st.dataframe(risk, hide_index=True, width="stretch")

    alerts = risk[risk["spc_alarm"] | (risk["predicted_risk_%"] > 15)]
    st.subheader("Quality alerts")
    if n and (log["severity"] == "Critical").any():
        crit = log[log["severity"] == "Critical"]
        st.error(f"{len(crit)} critical part(s) found: {', '.join(crit['defect'].astype(str).unique())}. "
                 "Quarantine the batch and inspect the die.")
    for _, a in alerts.iterrows():
        top = history[(history["machine"] == a["machine"]) & (history["defect"] != "none")].tail(50)
        example = top.iloc[-1].to_dict() if len(top) else None
        msg = (f"Machine {a['machine']}: predicted defect risk {a['predicted_risk_%']}% "
               f"(recent rate {a['defect_rate_recent_%']}%, mostly {a['main_defect']}).")
        if example:
            why = rc.explain(example, example["defect"])
            if why["causes"]:
                c = why["causes"][0]
                msg += f" Likely cause: {c['factor'].replace('_', ' ')} {c['direction']}. Action: {c['action']}"
        st.warning(msg)
    if alerts.empty:
        st.success("No machine is above its alert limit.")

    st.subheader("Defect rate over time per machine (simulated history)")
    h = history.copy()
    h["defective"] = (h["defect"] != "none").astype(int)
    trend = (h.groupby(["machine", "batch"])["defective"].mean().mul(100).round(1)
             .reset_index().pivot(index="batch", columns="machine", values="defective"))
    trend.index = [b.split("-")[1] for b in trend.index]
    st.line_chart(trend.groupby(level=0).mean())

    if n:
        st.subheader("This session's inspections")
        st.bar_chart(log[log["category"].isin(["none"]) == False]["category"].value_counts())
        st.dataframe(log, hide_index=True, width="stretch")
        st.download_button("Download inspection log (CSV)", log.to_csv(index=False), "inspection_log.csv")

# ---------- about ----------
with tab_about:
    st.markdown("""
**Flow for each part**
1. The **defect model** (YOLO11s) looks for 8 known casting defects and draws boxes.
2. If it is not sure, the **anomaly model** (PatchCore, trained only on good parts) checks whether the part looks unusual and shows a heat-map.
3. The **decision** combines both: PASS, REVIEW (send to a person) or REJECT.
4. **Severity** comes from clear rules: defect type, size and confidence. A crack is never below High.
5. **Root cause**: a LightGBM model maps machine readings to defect types; SHAP shows which readings pushed the result, and each cause has a corrective action.
6. **Prediction**: each machine's recent readings give a risk score, with an SPC alarm on rising defect rates.

**Runs without a GPU.** Measured on a laptop CPU (i5-13450HX): defect model 77 ms per photo, 45 ms after OpenVINO INT8 export.

**Honest limits.** Machine readings are simulated, because no public dataset links casting photos to process data. The method is ready for a plant's real readings (CSV, OPC UA or MQTT).
""")
