import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Inspector from "./components/Inspector.jsx";
import ReviewQueue from "./components/ReviewQueue.jsx";
import EarlyWarning from "./components/EarlyWarning.jsx";
import MachineRisk from "./components/MachineRisk.jsx";
import Kpis from "./components/Kpis.jsx";
import Header, { TABS } from "./components/Header.jsx";
import SelfLearning from "./components/SelfLearning.jsx";
import ReviewRules from "./components/ReviewRules.jsx";
import Icon from "./components/Icon.jsx";

// Page titles: one plain sentence on what each area is for.
const VIEW_INFO = {
  inspect: ["Inspection", "Check part photos and settle the parts the system is unsure about."],
  line: ["Line health", "See which machines are drifting toward defects before bad parts appear."],
  models: ["Models & rules", "How the anomaly model learns from inspectors, and when a person is asked to decide."],
};

const fromHash = () => {
  const h = window.location.hash.slice(1);
  return TABS.some(([k]) => k === h) ? h : "inspect";
};

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
  const [tab, setTab] = useState(fromHash);

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
    const hash = () => setTab(fromHash());
    window.addEventListener("hashchange", hash);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("hashchange", hash);
    };
  }, [refresh]);

  function openTab(key) {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const alerts = (early?.machines ?? []).filter((m) => m.status === "alert").length + risk.filter((m) => m.spc_alarm).length;

  return (
    <div className="app">
      <Header tab={tab} onTab={openTab} health={health} reviewCount={review.length} alerts={alerts} learning={learning} clock={clock} />
      <main className="page">
        {error && (
          <div className="banner" role="alert">
            <Icon name="warn" size={18} />
            <span>{error}</span>
          </div>
        )}
        <div className="page-head">
          <div>
            <h1>{VIEW_INFO[tab][0]}</h1>
            <p>{VIEW_INFO[tab][1]}</p>
          </div>
          {tab === "line" && <span className="sim-chip" title="See the note at the bottom of the page">Machine readings are simulated</span>}
        </div>
        <Kpis summary={summary} />

        {/* every section stays mounted so inspected parts and chart choices survive a tab switch */}
        <section className="view view-inspect" hidden={tab !== "inspect"}>
          <Inspector onInspected={refresh} decided={decided} focus={focus} />
          <ReviewQueue items={review} labelsSaved={summary?.labels_saved ?? 0} onLabelled={(id, decision) => {
              setDecided((d) => ({ ...d, [id]: decision }));
              setFocus({ id, at: Date.now() });
              return refresh();
            }}
          />
        </section>

        <section className="view view-line" hidden={tab !== "line"}>
          <EarlyWarning data={early} />
          <MachineRisk risk={risk} />
        </section>

        <section className="view view-models" hidden={tab !== "models"}>
          <SelfLearning data={learning} onChange={refresh} />
          <ReviewRules />
        </section>

        <footer className="foot">
          <b>Team Translucent</b>
          <span>Defect model YOLO11 · anomaly model PatchCore · root cause LightGBM + SHAP · inspection on CPU</span>
          <span>Machine readings and the early-warning history are simulated; live inspected parts are added on top.</span>
        </footer>
      </main>
    </div>
  );
}
