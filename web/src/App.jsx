import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Inspector from "./components/Inspector.jsx";
import ReviewQueue from "./components/ReviewQueue.jsx";
import EarlyWarning from "./components/EarlyWarning.jsx";
import MachineRisk from "./components/MachineRisk.jsx";
import Kpis from "./components/Kpis.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SelfLearning from "./components/SelfLearning.jsx";
import ReviewRules from "./components/ReviewRules.jsx";

export default function App() {
  const [summary, setSummary] = useState(null);
  const [review, setReview] = useState([]);
  const [early, setEarly] = useState(null);
  const [risk, setRisk] = useState([]);
  const [health, setHealth] = useState(null);
  const [learning, setLearning] = useState(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(new Date());
  const [decided, setDecided] = useState({}); // part id -> decision a person made in the review queue
  const [focus, setFocus] = useState(null); // part to show in the inspector after a review

  const refresh = useCallback(async () => {
    try {
      const [s, r, e, k, l] = await Promise.all([api.summary(), api.review(), api.earlyWarning(), api.risk(), api.retrain()]);
      setSummary(s);
      setLearning(l);
      setReview(r);
      setEarly(e);
      setRisk(k);
      setError("");
    } catch (err) {
      setError(`Cannot reach the inspection service: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    refresh();
    const poll = setInterval(refresh, 15000);
    const tick = setInterval(() => setClock(new Date()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  return (
    <div className="layout">
      <Sidebar health={health} reviewCount={review.length} />
      <main className="main" id="top">
        <header className="top">
          <h1>Casting line · Live inspection</h1>
          <span className="sub">Cast aluminium parts · {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="pill live">● LIVE</span>
          <a className="pill docs" href="/docs" target="_blank" rel="noreferrer">API docs</a>
        </header>
        {error && <div className="banner">{error}</div>}

        <Kpis summary={summary} />

        <div className="grid">
          <div className="col">
            <Inspector onInspected={refresh} decided={decided} focus={focus} />
            <ReviewQueue items={review} labelsSaved={summary?.labels_saved ?? 0} onLabelled={(id, decision) => {
                setDecided((d) => ({ ...d, [id]: decision }));
                setFocus({ id, at: Date.now() });
                return refresh();
              }}
            />
            <SelfLearning data={learning} onChange={refresh} />
          </div>
          <div className="col">
            <ReviewRules />
            <EarlyWarning data={early} />
            <MachineRisk risk={risk} />
          </div>
        </div>
        <p className="foot">
          Team Translucent · Defect model YOLO11 · anomaly model PatchCore · root cause LightGBM + SHAP · runs on CPU.
          Machine readings and the early-warning history are simulated; live inspected parts are added on top.
        </p>
      </main>
    </div>
  );
}
