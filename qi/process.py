"""Simulated process data, root cause and risk prediction.

No public casting dataset links photos to machine readings, so readings are SIMULATED.
The simulator plants known causes (e.g. low injection pressure -> porosity). The root-cause
model has to find them again, which shows the method works on real plant data later.
"""
import numpy as np
import pandas as pd

from . import config

FEATURES = ["melt_temp", "injection_pressure", "die_temp", "cycle_time", "vibration",
            "die_age", "conveyor_speed"]
MACHINES = ["M1", "M2", "M3", "M4"]
CLASSES = ["none", "porosity", "crack", "deformation", "other", "scratch"]
NORMAL = {"melt_temp": (690, 8), "injection_pressure": (90, 6), "die_temp": (220, 10),
          "cycle_time": (45, 3), "vibration": (2.0, 0.5), "die_age": (20000, 8000),
          "conveyor_speed": (0.5, 0.08)}
UNITS = {"melt_temp": "°C", "injection_pressure": "MPa", "die_temp": "°C", "cycle_time": "s",
         "vibration": "mm/s", "die_age": "shots", "conveyor_speed": "m/s"}


def _readings(rng, n, machine, drift):
    d = {k: rng.normal(m, s, n) for k, (m, s) in NORMAL.items()}
    if machine == "M3":                       # hydraulic drift: pressure falls over time
        d["injection_pressure"] -= drift * 22
    if machine == "M2":                       # old die
        d["die_age"] += 60000
    if machine == "M4":                       # loose mount
        d["vibration"] += 0.8
    return d


def _probs(r):
    """Planted causes -> defect probabilities."""
    p = {c: 0.004 for c in CLASSES[1:]}
    p["porosity"] += 0.35 * (r["injection_pressure"] < 78) + 0.15 * (r["melt_temp"] > 705)
    p["crack"] += 0.30 * ((r["vibration"] > 2.8) & (r["die_temp"] < 215))
    p["deformation"] += 0.30 * (r["melt_temp"] < 678)
    p["other"] += 0.25 * (r["die_age"] > 70000) + 0.2 * (r["injection_pressure"] > 102)
    p["scratch"] += 0.25 * (r["conveyor_speed"] > 0.62)
    return p


def _label(rng, r):
    p = _probs(r)
    u = rng.random()
    acc = 0.0
    for c, v in p.items():
        acc += v
        if u < acc:
            return c
    return "none"


def simulate_history(n_per_machine=600, seed=7):
    """Past production: one row per part, time-ordered per machine."""
    rng = np.random.default_rng(seed)
    rows = []
    start = pd.Timestamp("2026-10-01 06:00")
    for m in MACHINES:
        drift = np.linspace(0, 1, n_per_machine)
        d = _readings(rng, n_per_machine, m, drift)
        for i in range(n_per_machine):
            r = {k: float(v[i]) for k, v in d.items()}
            r.update(machine=m, part_no=i, time=start + pd.Timedelta(seconds=50 * i),
                     batch=f"{m}-B{i // 100 + 1:02d}", shift=["A", "B", "C"][(i // 200) % 3])
            r["defect"] = _label(rng, r)
            rows.append(r)
    return pd.DataFrame(rows)


def reading_for(category, seed):
    """Simulated PLC log for one inspected part, consistent with what was found on it."""
    rng = np.random.default_rng(seed)
    machine = MACHINES[seed % 4]
    for _ in range(400):
        d = _readings(rng, 1, machine, rng.random())
        r = {k: float(v[0]) for k, v in d.items()}
        r["machine"] = machine
        if category in ("none", "unknown") or _probs(r).get(category, 0) >= 0.2:
            break
    r["batch"] = f"{machine}-B{rng.integers(1, 7):02d}"
    return r


class RootCause:
    """LightGBM learns readings -> defect type; SHAP explains which readings drove it."""

    def __init__(self, history):
        import lightgbm as lgb
        import shap
        X = self._x(history)
        y = history["defect"].map({c: i for i, c in enumerate(CLASSES)})
        self.model = lgb.LGBMClassifier(n_estimators=200, learning_rate=0.05, num_leaves=15,
                                        class_weight="balanced", verbose=-1, random_state=0)
        self.model.fit(X, y)
        self.explainer = shap.TreeExplainer(self.model)
        self.means = X.mean()

    @staticmethod
    def _x(df):
        X = df[FEATURES].copy()
        for m in MACHINES:
            X[f"machine_{m}"] = (df["machine"] == m).astype(int)
        return X

    def explain(self, reading, category):
        """Top causes for this part's defect, with the model's confidence."""
        X = self._x(pd.DataFrame([reading]))
        prob = self.model.predict_proba(X)[0]
        cls = CLASSES.index(category) if category in CLASSES else int(np.argmax(prob[1:]) + 1)
        sv = self.explainer.shap_values(X)
        sv = np.asarray(sv)
        if sv.ndim == 3 and sv.shape[0] == 1:      # (1, features, classes)
            contrib = sv[0, :, cls]
        else:                                      # list per class
            contrib = np.asarray(sv[cls])[0]
        causes = []
        for idx in np.argsort(-contrib)[:3]:
            f = X.columns[idx]
            if contrib[idx] <= 0 or f.startswith("machine_"):
                continue
            direction = "high" if X.iloc[0, idx] > self.means[f] else "low"
            if (f, direction) not in config.CORRECTIVE_ACTION:
                continue
            causes.append({
                "factor": f, "value": round(float(X.iloc[0, idx]), 2), "unit": UNITS.get(f, ""),
                "normal": round(float(self.means[f]), 2), "direction": direction,
                "action": config.CORRECTIVE_ACTION[(f, direction)],
                "impact": round(float(contrib[idx]), 3),
            })
        # confidence that this defect type comes from these readings, given the part is defective
        conf = prob[cls] / max(1e-6, 1 - prob[0]) if cls else prob[cls]
        return {"predicted": CLASSES[cls], "confidence": round(float(conf), 2), "causes": causes}

    def risk(self, history, window=100):
        """Chance that the next parts on each machine are defective, from its latest readings."""
        out = []
        for m in MACHINES:
            h = history[history["machine"] == m].sort_values("time")
            recent = h.tail(window)
            p_def = 1 - self.model.predict_proba(self._x(recent))[:, 0]
            rate_all = (h["defect"] != "none").mean()
            rate_recent = (recent["defect"] != "none").mean()
            sigma = np.sqrt(rate_all * (1 - rate_all) / window)
            top = recent.loc[recent["defect"] != "none", "defect"].value_counts()
            out.append({
                "machine": m, "defect_rate_recent_%": round(100 * rate_recent, 1),
                "defect_rate_overall_%": round(100 * rate_all, 1),
                "predicted_risk_%": round(100 * float(p_def.mean()), 1),
                "spc_alarm": bool(rate_recent > rate_all + 3 * sigma),
                "main_defect": top.index[0] if len(top) else "none",
            })
        return pd.DataFrame(out).sort_values("predicted_risk_%", ascending=False)


def simulate_good_scores(history, seed=11):
    """Simulated anomaly scores of GOOD parts over time (early warning).

    A part can pass and still look slightly less "normal" when its machine drifts.
    Planted link: falling injection pressure, high vibration and an old die raise the score
    of parts that still pass. Real plants would log the anomaly model's actual scores.
    """
    rng = np.random.default_rng(seed)
    good = history[history["defect"] == "none"].copy()
    good["score"] = (0.12
                     + 0.011 * np.clip(88 - good["injection_pressure"], 0, None)
                     + 0.04 * np.clip(good["vibration"] - 2.5, 0, None)
                     + 8e-7 * np.clip(good["die_age"] - 30000, 0, None)
                     + rng.normal(0, 0.02, len(good))).clip(0.02, 0.95)
    good["live"] = False
    return good[["machine", "time", "score", "live"]].reset_index(drop=True)


def early_warning(scores, warning, limit, bin_size=20, fit_bins=8, horizon_h=8):
    """Trend of good-part scores per machine, with a straight-line forecast to the reject limit."""
    out = []
    for m in MACHINES:
        s = scores[scores["machine"] == m].sort_values("time")
        if s.empty:
            continue
        sim = s[~s["live"]].reset_index(drop=True)
        g = sim.groupby(sim.index // bin_size).agg(time=("time", "last"), score=("score", "mean"))
        g = pd.concat([g, s.loc[s["live"], ["time", "score"]]], ignore_index=True)   # live parts stay as single points
        t_h = (g["time"] - g["time"].iloc[0]).dt.total_seconds() / 3600
        tail = g.tail(fit_bins)
        th = t_h.tail(fit_bins)
        slope = float(np.polyfit(th, tail["score"], 1)[0]) if len(tail) >= 3 else 0.0
        last = float(tail["score"].iloc[-1])
        hours_to_limit = (limit - last) / slope if slope > 1e-4 and last < limit else None
        hours_to_warning = (warning - last) / slope if slope > 1e-4 and last < warning else None
        if last >= warning or (hours_to_limit is not None and hours_to_limit <= horizon_h):
            status = "alert"
        elif slope > 0.01:
            status = "watch"
        else:
            status = "ok"
        t_last = g["time"].iloc[-1]
        forecast = []
        if slope > 1e-4:
            for h in (1, 2, 3):
                forecast.append({"time": (t_last + pd.Timedelta(hours=h)).isoformat(),
                                 "score": round(min(1.0, last + slope * h), 3)})
        out.append({
            "machine": m, "status": status, "last_score": round(last, 3),
            "slope_per_hour": round(slope, 4),
            "hours_to_warning": round(hours_to_warning, 1) if hours_to_warning is not None else None,
            "hours_to_limit": round(hours_to_limit, 1) if hours_to_limit is not None else None,
            "points": [{"time": t.isoformat(), "score": round(float(v), 3)} for t, v in zip(g["time"], g["score"])],
            "forecast": forecast,
        })
    order = {"alert": 0, "watch": 1, "ok": 2}
    return sorted(out, key=lambda r: (order[r["status"]], -r["last_score"]))
