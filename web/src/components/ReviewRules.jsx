import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import { pct } from "../format.js";

// The review range: which parts the system decides on its own and which go to a person.
export default function ReviewRules() {
  const [rules, setRules] = useState(null);
  const [saved, setSaved] = useState("");
  const [loadError, setLoadError] = useState(""); // display only: why the card could not load
  const timer = useRef(null);

  useEffect(() => {
    api.rules().then(setRules).catch((err) => {
      setRules(null);
      setLoadError(err.message);
    });
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

  if (!rules) {
    return (
      <section className="panel" id="rules">
        <div className="ph"><div className="ph-title"><h2>Review range</h2><p className="sub">Which parts the system decides alone and which go to a person</p></div></div>
        {loadError ? (
          <div className="note err" role="alert">Could not load the review range: {loadError}</div>
        ) : (
          <div className="skeleton-rows" role="status" aria-label="Loading the review range"><i /><i /><i /></div>
        )}
      </section>
    );
  }
  const { ignore_below: lo, reject_above: hi, anomaly_review: an, defaults: d } = rules;
  const isDefault = d && lo === d.ignore_below && hi === d.reject_above && an === d.anomaly_review;
  const failed = saved.startsWith("Not");

  return (
    <section className="panel" id="rules">
      <div className="ph">
        <div className="ph-title">
          <h2>Review range</h2>
          <p className="sub">Which parts the system decides alone and which go to a person</p>
        </div>
        <span className={`saved small ${failed ? "t-reject" : saved ? "t-pass" : "muted"}`} role="status">
          {saved && <Icon name={failed ? "warn" : "check"} size={14} />}
          {saved}
        </span>
      </div>

      <div className="rule-block">
        <div className="rule-label">
          <b>Defect model confidence</b>
          <span className="muted small">drag the two handles</span>
        </div>
        <div className="rule-values num">
          <span><i className="dot s-neutral" />ignore below <b>{pct(lo)}</b></span>
          <span><i className="dot s-review" />unsure <b>{pct(lo)}–{pct(hi)}</b></span>
          <span><i className="dot s-reject" />reject from <b>{pct(hi)}</b></span>
        </div>
        <div className="range-stack">
          <div className="zones" aria-hidden="true">
            <div className="z ignore" style={{ width: pct(lo) }}><span>ignored</span></div>
            <div className="z unsure" style={{ width: pct(hi - lo) }}><span>unsure</span></div>
            <div className="z reject" style={{ width: pct(1 - hi) }}><span>reject</span></div>
          </div>
          <div className="dual">
            <input type="range" min="0.05" max="0.95" step="0.01" value={lo} aria-label="Ignore defect boxes below"
              onChange={(e) => change({ ignore_below: Math.min(+e.target.value, hi - 0.01) })} />
            <input type="range" min="0.05" max="0.95" step="0.01" value={hi} aria-label="Reject without a person above"
              onChange={(e) => change({ reject_above: Math.max(+e.target.value, lo + 0.01) })} />
          </div>
        </div>
        <div className="scale-axis num" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      </div>

      <div className="rule-block">
        <div className="rule-label">
          <b>Anomaly score review line</b>
          <span className="num rule-num">{an.toFixed(2)}</span>
        </div>
        <div className="range-stack single-stack">
          <div className="zones" aria-hidden="true">
            <div className="z normal" style={{ width: pct(an) }}><span>looks normal</span></div>
            <div className="z unusual" style={{ width: pct(1 - an) }}><span>unusual</span></div>
          </div>
          <input className="single" type="range" min="0.1" max="0.9" step="0.01" value={an} aria-label="Anomaly score review line"
            onChange={(e) => change({ anomaly_review: +e.target.value })} />
        </div>
        <div className="scale-axis num" aria-hidden="true"><span>0</span><span>0.25</span><span>0.50</span><span>0.75</span><span>1</span></div>
      </div>

      <ul className="rule-text">
        <li><span className="dot s-reject" />Defect box <b>{pct(hi)}</b> sure or more: <b>REJECT</b>, no person needed.</li>
        <li><span className="dot s-review" />Box between <b>{pct(lo)}</b> and <b>{pct(hi)}</b>: the anomaly model double-checks. It rejects if the score is {an.toFixed(2)} or more, otherwise a person reviews it.</li>
        <li><span className="dot s-review" />No box, but anomaly score <b>{an.toFixed(2)}</b> or more: a person reviews it.</li>
        <li><span className="dot s-pass" />Otherwise: <b>PASS</b>.</li>
      </ul>
      <div className="rule-foot">
        <span className="muted small">A wider amber range sends more parts to the anomaly model and to people: safer, but slower.</span>
        <button className="btn ghost" disabled={isDefault}
          onClick={() => change({ ignore_below: d.ignore_below, reject_above: d.reject_above, anomaly_review: d.anomaly_review })}>
          <Icon name="reset" size={14} />Reset to defaults
        </button>
      </div>
    </section>
  );
}
