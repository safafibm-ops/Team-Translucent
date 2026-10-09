import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const ARROW = { low: "↓", high: "↑" };
const nice = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Inspector({ onInspected, decided = {}, focus }) {
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState("boxes");
  const [progress, setProgress] = useState("");
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
    for (let i = 0; i < list.length; i++) {
      setProgress(`Inspecting ${i + 1} of ${list.length}: ${list[i].name}`);
      try {
        const r = await api.inspect(list[i]);
        setResults((prev) => [r, ...prev].slice(0, 30));
        setCurrent(0);
        setView("boxes");
      } catch (err) {
        setProgress(`${list[i].name}: ${err.message}`);
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

  return (
    <section
      className={`card ${drag ? "dragging" : ""}`}
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
      <div className="h">
        <span className="ttl">{r ? `Latest part · ${r.part}` : "Inspect parts"}</span>
        <span className="r">
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => run(e.target.files)} />
          <button className="btn" onClick={() => input.current.click()}>Inspect photos</button>
        </span>
      </div>
      {progress && <div className="progress">{progress}</div>}

      {!r ? (
        <div className="drop" onClick={() => input.current.click()}>
          <b>Drop part photos here</b>
          <span>or click to choose one or more photos. Each part is checked in under half a second on the CPU.</span>
        </div>
      ) : (
        <>
          <div className="inspect">
            <div className="cam">
              <img src={image} alt={r.part} />
              <span className="tag">
                {view === "heat" ? `Anomaly heat-map · score ${r.anomaly_score}` : "Defect model boxes"}
              </span>
              <div className="toggle">
                <button className={view === "boxes" ? "sel" : ""} onClick={() => setView("boxes")}>Boxes</button>
                <button
                  className={view === "heat" ? "sel" : ""}
                  disabled={!r.heatmap}
                  title={r.heatmap ? "" : "Anomaly model skipped: the defect model was already sure"}
                  onClick={() => setView("heat")}
                >
                  Heat-map
                </button>
              </div>
            </div>

            <div className="dec">
              <div className="badge-row">
                <div className={`decision ${decision}`}>{decision}</div>
                {r.severity && <div className={`sev sev-${r.severity}`}>Severity: {r.severity.toUpperCase()}</div>}
              </div>
              <div className="muted">
                {byPerson ? `Checked by a person in the review queue (system said REVIEW: ${r.reason.toLowerCase()})` : r.reason}
              </div>
              <div className="meta">
                <div>
                  <span>Defect</span>
                  <b>{r.main_defect ? nice(r.main_defect) : r.decision === "PASS" ? "None" : "Unknown"}</b>
                </div>
                <div>
                  <span>Size</span>
                  <b>{main ? `${main.area_pct}% of photo` : "–"}</b>
                </div>
                <div>
                  <span>Machine</span>
                  <b>{r.machine}</b>
                </div>
                <div>
                  <span>Batch</span>
                  <b>{r.batch}</b>
                </div>
              </div>

              {r.root_cause ? (
                <div className="cause">
                  <div className="t">
                    {causes.length
                      ? `Likely cause: ${causes[0].factor.replace(/_/g, " ")} too ${causes[0].direction}`
                      : "No single machine reading stands out"}{" "}
                    <span className="muted">(confidence {Math.round(r.root_cause.confidence * 100)}%)</span>
                  </div>
                  {causes.map((c) => (
                    <div className="bar" key={c.factor}>
                      <span className="n">
                        {nice(c.factor)} {ARROW[c.direction]} {c.value} {c.unit}
                      </span>
                      <div className="track">
                        <div className="fill bg-red" style={{ width: `${(100 * c.impact) / maxImpact}%` }} />
                      </div>
                      <span className="p">normal {c.normal}</span>
                    </div>
                  ))}
                  <div className="muted small">Simulated machine readings for this part · SHAP impact</div>
                </div>
              ) : (
                <div className="cause good">
                  <div className="t">Good part</div>
                  {r.anomaly_score != null && (
                    <div className="muted small">
                      Anomaly score {r.anomaly_score} was added to {r.machine}'s early-warning trend.
                    </div>
                  )}
                </div>
              )}

              {causes.length > 0 && (
                <div className="fix">
                  <span>
                    <b>Fix:</b> {causes[0].action}
                  </span>
                  {order[r.id] ? (
                    <span className="done">{order[r.id]} created</span>
                  ) : (
                    <button className="btn" onClick={() => createOrder(r, causes[0].action)}>Create work order</button>
                  )}
                </div>
              )}
              <div className="muted small">
                Checked in {(r.cpu_ms.total / 1000).toFixed(2)} s on the CPU: defect model {r.cpu_ms.defect} ms
                {r.cpu_ms.anomaly != null ? ` + anomaly model ${r.cpu_ms.anomaly} ms` : " (anomaly model skipped)"}
              </div>
            </div>
          </div>

          {results.length > 1 && (
            <div className="recent">
              {results.slice(0, 8).map((x, i) => (
                <button
                  key={x.id}
                  className={`rchip ${i === current ? "sel" : ""}`}
                  onClick={() => {
                    setCurrent(i);
                    setView("boxes");
                  }}
                >
                  <span className={`dot d-${decided[x.id] ?? x.decision}`} />
                  {x.part}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
