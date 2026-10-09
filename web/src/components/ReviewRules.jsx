import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const pct = (v) => `${Math.round(v * 100)}%`;

// The review range: which parts the system decides on its own and which go to a person.
export default function ReviewRules() {
  const [rules, setRules] = useState(null);
  const [saved, setSaved] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    api.rules().then(setRules).catch(() => setRules(null));
  }, []);

  function change(next) {
    const r = { ...rules, ...next };
    setRules(r);
    setSaved("");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setRules(await api.setRules(r));
        setSaved("Saved · applies to the next part");
      } catch (err) {
        setSaved(`Not saved: ${err.message}`);
      }
    }, 400);
  }

  if (!rules) return null;
  const { ignore_below: lo, reject_above: hi, anomaly_review: an, defaults: d } = rules;
  const isDefault = d && lo === d.ignore_below && hi === d.reject_above && an === d.anomaly_review;

  return (
    <section className="card" id="rules">
      <div className="h">
        Review range
        <span className="r muted small">{saved}</span>
      </div>

      <div className="rule-label">
        <b>Defect model confidence</b>
        <span className="muted small">drag the two handles</span>
      </div>
      <div className="zones">
        <div className="z ignore" style={{ width: pct(lo) }}>ignored</div>
        <div className="z unsure" style={{ width: pct(hi - lo) }}>unsure</div>
        <div className="z reject" style={{ width: pct(1 - hi) }}>reject</div>
      </div>
      <div className="dual">
        <input type="range" min="0.05" max="0.95" step="0.01" value={lo} aria-label="Ignore defect boxes below"
          onChange={(e) => change({ ignore_below: Math.min(+e.target.value, hi - 0.01) })} />
        <input type="range" min="0.05" max="0.95" step="0.01" value={hi} aria-label="Reject without a person above"
          onChange={(e) => change({ reject_above: Math.max(+e.target.value, lo + 0.01) })} />
      </div>

      <div className="rule-label">
        <b>Anomaly score review line</b>
        <span className="muted small">{an.toFixed(2)}</span>
      </div>
      <input className="single" type="range" min="0.1" max="0.9" step="0.01" value={an} aria-label="Anomaly score review line"
        onChange={(e) => change({ anomaly_review: +e.target.value })} />

      <ul className="rule-text">
        <li><span className="dot bg-red" />Defect box <b>{pct(hi)}</b> sure or more: <b>REJECT</b>, no person needed.</li>
        <li><span className="dot bg-amber" />Box between <b>{pct(lo)}</b> and <b>{pct(hi)}</b>: the anomaly model double-checks. It rejects if the score is {an.toFixed(2)} or more, otherwise a person reviews it.</li>
        <li><span className="dot bg-amber" />No box, but anomaly score <b>{an.toFixed(2)}</b> or more: a person reviews it.</li>
        <li><span className="dot bg-green" />Otherwise: <b>PASS</b>.</li>
      </ul>
      <div className="rule-foot">
        <span className="muted small">A wider amber range sends more parts to the anomaly model and to people: safer, but slower.</span>
        <button className="link" disabled={isDefault}
          onClick={() => change({ ignore_below: d.ignore_below, reject_above: d.reject_above, anomaly_review: d.anomaly_review })}>
          Reset
        </button>
      </div>
    </section>
  );
}
