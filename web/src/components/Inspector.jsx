import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import { LEVELS, hhmm, nice, shortName } from "../format.js";

const ARROW = { low: "↓", high: "↑" };
const DECISION_ICON = { PASS: "check", REVIEW: "warn", REJECT: "cross" };

// Four-step severity scale (Low, Medium, High, Critical) so the level reads at a glance.
function Severity({ level }) {
  const n = LEVELS.indexOf(level);
  return (
    <div className={`sev sev-${n}`} title={`Severity ${level}`}>
      <span className="sev-l">Severity</span>
      <span className="sev-steps" aria-hidden="true">
        {LEVELS.map((l, i) => <i key={l} className={i <= n ? "on" : ""} />)}
      </span>
      <b>{level}</b>
    </div>
  );
}

export default function Inspector({ onInspected, decided = {}, focus }) {
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState("boxes");
  const [progress, setProgress] = useState("");
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState(false);
  const [order, setOrder] = useState({});
  const input = useRef(null);

  // after a person reviews a part, show that part here so the new decision is visible
  useEffect(() => {
    if (!focus) return;
    const i = results.findIndex((x) => x.id === focus.id);
    if (i >= 0) {
      setCurrent(i);
      setView("boxes");
    }
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setFailed(false);
    for (let i = 0; i < list.length; i++) {
      setProgress(`Inspecting ${i + 1} of ${list.length}: ${list[i].name}`);
      try {
        const r = await api.inspect(list[i]);
        setResults((prev) => [r, ...prev].slice(0, 30));
        setCurrent(0);
        setView("boxes");
      } catch (err) {
        setProgress(`${list[i].name}: ${err.message}`);
        setFailed(true);
        return;
      }
    }
    setProgress("");
    onInspected();
  }

  async function createOrder(r, action) {
    const o = await api.workOrder(r.machine, action, r.part);
    setOrder((prev) => ({ ...prev, [r.id]: o.work_order }));
    onInspected();
  }

  const r = results[current];
  const byPerson = r ? decided[r.id] : null;
  const decision = byPerson ?? r?.decision;
  const causes = r?.root_cause?.causes ?? [];
  const maxImpact = Math.max(0.001, ...causes.map((c) => c.impact));
  const main = r?.defects?.find((d) => d.defect === r.main_defect) ?? null;
  const image = view === "heat" && r?.heatmap ? r.heatmap : r?.boxed_image;
  const busy = progress && !failed;
  const ms = r?.cpu_ms;
  const defectShare = ms ? (100 * ms.defect) / Math.max(ms.total, 0.001) : 0;

  return (
    <section
      className={`panel inspector ${drag ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        run(e.dataTransfer.files);
      }}
    >
      <div className="ph">
        <div className="ph-title">
          <h2>{r ? "Latest part" : "Inspect parts"}</h2>
          <p className="sub" title={r?.part}>
            {r ? (
              <>
                <span className="mono">{shortName(r.part)}</span>
                <span className="sep">·</span>checked at {hhmm(r.time)}
              </>
            ) : (
              "Photos from the line camera or a folder"
            )}
          </p>
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => run(e.target.files)} />
        <button className="btn primary" onClick={() => input.current.click()} disabled={busy}>
          <Icon name="upload" />Inspect photos
        </button>
      </div>
      {progress && (
        <div className={`progress ${failed ? "err" : ""}`} role="status">
          {failed ? <Icon name="warn" /> : <span className="spin" />}
          <span className="progress-text" title={progress}>{progress}</span>
          {!failed && <i className="progress-bar" aria-hidden="true" />}
        </div>
      )}

      {!r ? (
        <button className="drop" onClick={() => input.current.click()}>
          <span className="drop-icon"><Icon name="upload" size={26} /></span>
          <b>Drop part photos here</b>
          <span>or click to choose one or more photos. Each part is checked in under half a second on the CPU.</span>
          <span className="drop-steps" aria-hidden="true">
            <span><Icon name="layers" size={14} />Defect model</span>
            <Icon name="right" size={14} />
            <span><Icon name="flame" size={14} />Anomaly model when unsure</span>
            <Icon name="right" size={14} />
            <span><Icon name="shield" size={14} />Pass, review or reject</span>
          </span>
        </button>
      ) : (
        <>
          <div className="inspect">
            <figure className="cam">
              <img src={image} alt={`${r.part}, ${view === "heat" ? "anomaly heat-map" : "defect boxes"}`} />
              <figcaption className="tag">
                <Icon name={view === "heat" ? "flame" : "square"} size={13} />
                {view === "heat" ? `Anomaly heat-map · score ${r.anomaly_score}` : "Defect model boxes"}
              </figcaption>
              <div className="seg on-image" role="group" aria-label="Image view">
                <button className={view === "boxes" ? "sel" : ""} aria-pressed={view === "boxes"} onClick={() => setView("boxes")}>Boxes</button>
                <button
                  className={view === "heat" ? "sel" : ""}
                  aria-pressed={view === "heat"}
                  disabled={!r.heatmap}
                  title={r.heatmap ? "" : "Anomaly model skipped: the defect model was already sure"}
                  onClick={() => setView("heat")}
                >
                  Heat-map
                </button>
              </div>
            </figure>

            <div className="dec">
              <div className={`verdict v-${decision}`} key={`${r.id}-${decision}`}>
                <span className="v-icon"><Icon name={DECISION_ICON[decision]} size={24} /></span>
                <div className="v-main">
                  <span className="v-eyebrow">{byPerson ? "Decided by a person" : "Decision"}</span>
                  <b className="v-word">{decision}</b>
                </div>
                {r.severity && <Severity level={r.severity} />}
              </div>
              <p className="reason">
                {byPerson ? `Checked by a person in the review queue (system said REVIEW: ${r.reason.toLowerCase()})` : r.reason}
              </p>
              <dl className="meta">
                <div>
                  <dt>Defect</dt>
                  <dd>{r.main_defect ? nice(r.main_defect) : r.decision === "PASS" ? "None" : "Unknown"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd className="num">{main ? `${main.area_pct}% of photo` : "–"}</dd>
                </div>
                <div>
                  <dt>Machine</dt>
                  <dd className="mono">{r.machine}</dd>
                </div>
                <div>
                  <dt>Batch</dt>
                  <dd className="mono">{r.batch}</dd>
                </div>
              </dl>

              {r.root_cause ? (
                <div className="cause">
                  <div className="cause-head">
                    <span className="eyebrow">Likely cause</span>
                    <span className="pill">confidence {Math.round(r.root_cause.confidence * 100)}%</span>
                  </div>
                  <div className="cause-t">
                    {causes.length
                      ? `${nice(causes[0].factor)} too ${causes[0].direction}`
                      : "No single machine reading stands out"}
                  </div>
                  {causes.map((c) => (
                    <div className="bar" key={c.factor}>
                      <span className="n">
                        <span>{nice(c.factor)} <span className={`dir d-${c.direction}`}>{ARROW[c.direction]}</span></span>
                        <span className="mono v">{c.value} {c.unit}</span>
                      </span>
                      <div className="track">
                        <div className="fill" style={{ width: `${(100 * c.impact) / maxImpact}%` }} />
                      </div>
                      <span className="p mono">normal {c.normal}</span>
                    </div>
                  ))}
                  <div className="muted small">Simulated machine readings for this part · SHAP impact</div>
                </div>
              ) : (
                <div className="cause good">
                  <div className="cause-head">
                    <span className="good-mark"><Icon name="check" size={15} /></span>
                    <span className="cause-t">Good part</span>
                  </div>
                  {r.anomaly_score != null && (
                    <div className="muted small">
                      Anomaly score {r.anomaly_score} was added to {r.machine}'s early-warning trend.
                    </div>
                  )}
                </div>
              )}

              {causes.length > 0 && (
                <div className="fix">
                  <span className="fix-icon"><Icon name="wrench" size={17} /></span>
                  <span className="fix-t"><b>Fix</b>{causes[0].action}</span>
                  {order[r.id] ? (
                    <span className="done"><Icon name="check" />{order[r.id]} created</span>
                  ) : (
                    <button className="btn" onClick={() => createOrder(r, causes[0].action)}>
                      <Icon name="doc" size={15} />Create work order
                    </button>
                  )}
                </div>
              )}

              <div className="timing">
                <div className="timing-row">
                  <span className="eyebrow"><Icon name="cpu" size={14} />Check time</span>
                  <b className="num">{(r.cpu_ms.total / 1000).toFixed(2)} s</b>
                </div>
                <div className="timing-bar" aria-hidden="true">
                  <i className="t-defect" style={{ width: `${defectShare}%` }} />
                  {r.cpu_ms.anomaly != null && <i className="t-anomaly" style={{ width: `${100 - defectShare}%` }} />}
                </div>
                <div className="muted small mono">
                  On the CPU: defect model {r.cpu_ms.defect} ms
                  {r.cpu_ms.anomaly != null ? ` + anomaly model ${r.cpu_ms.anomaly} ms` : " (anomaly model skipped)"}
                </div>
              </div>
            </div>
          </div>

          {results.length > 1 && (
            <div className="recent">
              <div className="recent-head">
                <span className="eyebrow"><Icon name="history" size={14} />Recent parts</span>
                <span className="muted small">click one to look at it again</span>
              </div>
              <div className="strip">
                {results.slice(0, 8).map((x, i) => (
                  <button
                    key={x.id}
                    className={`rchip ${i === current ? "sel" : ""}`}
                    title={x.part}
                    aria-pressed={i === current}
                    onClick={() => {
                      setCurrent(i);
                      setView("boxes");
                    }}
                  >
                    <img src={x.boxed_image} alt="" loading="lazy" />
                    <span className="rchip-meta">
                      <span className={`dot d-${decided[x.id] ?? x.decision}`} aria-hidden="true" />
                      <span className="sr-only">{decided[x.id] ?? x.decision}</span>
                      <span className="rchip-name">{shortName(x.part)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
