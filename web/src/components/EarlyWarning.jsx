import { useEffect, useState } from "react";

const W = 560;
const H = 200;
const PAD = { l: 34, r: 12, t: 14, b: 26 };
const STATUS = { alert: "red", watch: "amber", ok: "green" };

function headline(m) {
  if (!m) return "";
  if (m.status === "alert") {
    if (m.hours_to_limit != null) return `⚠ ${m.machine}: defects likely in ~${m.hours_to_limit} h`;
    return `⚠ ${m.machine}: good parts above the warning line`;
  }
  if (m.status === "watch") return `${m.machine}: score rising, keep watching`;
  return `${m.machine}: stable`;
}

export default function EarlyWarning({ data }) {
  const machines = data?.machines ?? [];
  const [sel, setSel] = useState(null);
  useEffect(() => {
    if (!sel && machines.length) setSel(machines[0].machine);
  }, [machines, sel]);
  const m = machines.find((x) => x.machine === sel) ?? machines[0];

  if (!m) {
    return (
      <section className="card" id="early">
        <div className="h">Early warning · good-part score</div>
        <div className="empty">Loading…</div>
      </section>
    );
  }

  const t = (s) => new Date(s).getTime();
  const all = machines.flatMap((x) => x.points);
  const t0 = Math.min(...all.map((p) => t(p.time)));
  const t1 = Math.max(...[...all, ...m.forecast].map((p) => t(p.time)));
  const yMax = Math.max(0.6, ...all.map((p) => p.score + 0.05), ...m.forecast.map((p) => p.score + 0.05));
  const x = (s) => PAD.l + ((t(s) - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const line = (pts) => pts.map((p) => `${x(p.time).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const last = m.points[m.points.length - 1];
  const ticks = [0, 1, 2, 3, 4].map((i) => t0 + ((t1 - t0) * i) / 4);
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="card" id="early">
      <div className="h">
        Early warning · good-part score
        <span className={`r ${STATUS[m.status]}`}>{headline(m)}</span>
      </div>
      <div className="chips">
        {machines.map((x) => (
          <button key={x.machine} className={`chip ${x.machine === m.machine ? "sel" : ""}`} onClick={() => setSel(x.machine)}>
            <span className={`dot bg-${STATUS[x.status]}`} />
            {x.machine} · {x.last_score}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Good-part anomaly score for ${m.machine}`}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(data.limit)} y2={y(data.limit)} className="limit" />
        <text x={PAD.l + 4} y={y(data.limit) - 5} className="lbl red-t">reject line {data.limit}</text>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(data.warning_level)} y2={y(data.warning_level)} className="warn" />
        <text x={PAD.l + 4} y={y(data.warning_level) - 5} className="lbl amber-t">warning line {data.warning_level}</text>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
        {machines
          .filter((o) => o.machine !== m.machine)
          .map((o) => (
            <polyline key={o.machine} points={line(o.points)} className="other" />
          ))}
        <polyline points={line(m.points)} className="main" />
        {m.forecast.length > 0 && <polyline points={line([last, ...m.forecast])} className="forecast" />}
        <circle cx={x(last.time)} cy={y(last.score)} r="4.5" className="now" />
        {ticks.map((ms, i) => (
          <text key={i} x={PAD.l + ((W - PAD.l - PAD.r) * i) / 4} y={H - 8} className="lbl" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
            {hhmm(ms)}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span><i className="sw sw-main" />{m.machine}</span>
        <span><i className="sw" />other machines</span>
        {m.forecast.length > 0 && <span><i className="sw sw-fc" />forecast</span>}
      </div>
      <p className="muted small">
        Parts from this machine still pass, but how "unusual" they look to the anomaly model is tracked over time.
        A rising score means the machine is drifting, so maintenance can step in before the first defect.
      </p>
    </section>
  );
}
