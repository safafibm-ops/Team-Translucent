import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { hhmm } from "../format.js";

const H = 270;
const PAD = { l: 40, r: 16, t: 16, b: 30 };
const STATUS = { alert: "reject", watch: "review", ok: "ok" }; // grey means normal
const STATUS_WORD = { alert: "Alert", watch: "Watch", ok: "Stable" };

function headline(m) {
  if (!m) return "";
  if (m.status === "alert") {
    if (m.hours_to_limit != null) return `${m.machine}: defects likely in ~${m.hours_to_limit} h`;
    return `${m.machine}: good parts above the warning line`;
  }
  if (m.status === "watch") return `${m.machine}: score rising, keep watching`;
  return `${m.machine}: stable`;
}

// Width of the chart box, so the SVG is drawn 1:1 and its labels stay readable on phones.
function useWidth(el, fallback) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const cw = Math.round(e.contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

export default function EarlyWarning({ data }) {
  const machines = data?.machines ?? [];
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [box, setBox] = useState(null);
  const W = Math.max(300, useWidth(box, 640));
  useEffect(() => {
    if (!sel && machines.length) setSel(machines[0].machine);
  }, [machines, sel]);
  const m = machines.find((x) => x.machine === sel) ?? machines[0];

  if (!m) {
    return (
      <section className="panel" id="early">
        <div className="ph"><div className="ph-title"><h2>Early warning</h2><p className="sub">Good-part anomaly score per machine</p></div></div>
        <div className="skeleton-chart" role="status" aria-label="Loading the early-warning chart" />
      </section>
    );
  }

  const t = (s) => new Date(s).getTime();
  const all = machines.flatMap((x) => x.points);
  const t0 = Math.min(...all.map((p) => t(p.time)));
  const t1 = Math.max(...[...all, ...m.forecast].map((p) => t(p.time)));
  const yMax = Math.max(0.6, data.limit + 0.05, ...all.map((p) => p.score + 0.05), ...m.forecast.map((p) => p.score + 0.05));
  const x = (s) => PAD.l + ((t(s) - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const line = (pts) => pts.map((p) => `${x(p.time).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const last = m.points[m.points.length - 1];
  const nT = W < 520 ? 3 : 5; // fewer time labels on narrow screens so they never overlap
  const ticks = Array.from({ length: nT }, (_, i) => t0 + ((t1 - t0) * i) / (nT - 1));
  const step = yMax <= 0.65 ? 0.1 : 0.2;
  const yTicks = Array.from({ length: Math.floor(yMax / step + 1e-9) + 1 }, (_, i) => +(i * step).toFixed(2));
  const area = `${line(m.points)} ${x(last.time).toFixed(1)},${y(0).toFixed(1)} ${x(m.points[0].time).toFixed(1)},${y(0).toFixed(1)}`;
  const right = W - PAD.r;

  // hover / touch readout: nearest measured or forecast point of the selected machine
  function track(e) {
    const b = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    const pts = [...m.points.map((p) => ({ ...p, fc: false })), ...m.forecast.map((p) => ({ ...p, fc: true }))];
    let best = null;
    for (const p of pts) if (!best || Math.abs(x(p.time) - px) < Math.abs(x(best.time) - px)) best = p;
    setHover(best);
  }
  const hx = hover ? x(hover.time) : 0;
  const hy = hover ? y(hover.score) : 0;

  return (
    <section className="panel" id="early">
      <div className="ph">
        <div className="ph-title">
          <h2>Early warning</h2>
          <p className="sub">Good-part anomaly score per machine</p>
        </div>
      </div>
      <div className={`alert-line a-${STATUS[m.status]}`} role="status">
        <Icon name={m.status === "ok" ? "check" : "warn"} size={18} />
        <span>{headline(m)}</span>
      </div>
      <div className="chips" role="group" aria-label="Machine">
        {machines.map((o) => (
          <button
            key={o.machine}
            className={`chip ${o.machine === m.machine ? "sel" : ""}`}
            aria-pressed={o.machine === m.machine}
            onClick={() => {
              setSel(o.machine);
              setHover(null);
            }}
          >
            <span className={`dot s-${STATUS[o.status]}`} />
            <b className="mono">{o.machine}</b>
            <span className="num">{o.last_score}</span>
            <span className="chip-word">{STATUS_WORD[o.status]}</span>
          </button>
        ))}
      </div>

      <dl className="ew-stats">
        <div><dt>Latest score</dt><dd className="num">{m.last_score}</dd></div>
        <div><dt>Trend</dt><dd className="num">{m.slope_per_hour > 0 ? "+" : ""}{m.slope_per_hour} / h</dd></div>
        <div><dt>Warning line</dt><dd className="num">{m.last_score >= data.warning_level ? "crossed" : m.hours_to_warning != null ? `in ~${m.hours_to_warning} h` : "not rising"}</dd></div>
        <div><dt>Reject line</dt><dd className="num">{m.last_score >= data.limit ? "crossed" : m.hours_to_limit != null ? `in ~${m.hours_to_limit} h` : "not rising"}</dd></div>
      </dl>

      <div className="chart-box" ref={setBox}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="chart"
          role="img"
          aria-label={`Good-part anomaly score for ${m.machine}`}
          onPointerMove={track}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="ew-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className="ew-fill-top" />
              <stop offset="1" className="ew-fill-bottom" />
            </linearGradient>
          </defs>
          <rect x={PAD.l} y={PAD.t} width={right - PAD.l} height={Math.max(0, y(data.limit) - PAD.t)} className="zone-reject" />
          <rect x={PAD.l} y={y(data.limit)} width={right - PAD.l} height={Math.max(0, y(data.warning_level) - y(data.limit))} className="zone-warn" />
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={right} y1={y(v)} y2={y(v)} className={v === 0 ? "axis" : "grid"} />
              <text x={PAD.l - 8} y={y(v) + 4} className="lbl" textAnchor="end">{v.toFixed(1)}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={right} y1={y(data.limit)} y2={y(data.limit)} className="limit" />
          <text x={PAD.l + 8} y={y(data.limit) - 6} className="lbl lbl-reject">reject line {data.limit}</text>
          <line x1={PAD.l} x2={right} y1={y(data.warning_level)} y2={y(data.warning_level)} className="warn" />
          <text x={PAD.l + 8} y={y(data.warning_level) - 6} className="lbl lbl-review">warning line {data.warning_level}</text>
          {machines
            .filter((o) => o.machine !== m.machine)
            .map((o) => (
              <polyline key={o.machine} points={line(o.points)} className="other" />
            ))}
          <polygon points={area} className="area" />
          <polyline points={line(m.points)} className="main" />
          {m.forecast.length > 0 && <polyline points={line([last, ...m.forecast])} className="forecast" />}
          <circle cx={x(last.time)} cy={y(last.score)} r="9" className="now-halo" />
          <circle cx={x(last.time)} cy={y(last.score)} r="4.5" className="now" />
          {ticks.map((ms, i) => (
            <text key={i} x={PAD.l + ((W - PAD.l - PAD.r) * i) / (nT - 1)} y={H - 9} className="lbl" textAnchor={i === 0 ? "start" : i === nT - 1 ? "end" : "middle"}>
              {hhmm(ms)}
            </text>
          ))}
          {hover && (
            <g className="cross">
              <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} />
              <circle cx={hx} cy={hy} r="5" />
            </g>
          )}
        </svg>
        {hover && (
          <div
            className={`chart-tip ${hx > W * 0.66 ? "flip" : ""}`}
            style={{ left: `${(100 * hx) / W}%`, top: `${(100 * hy) / H}%` }}
          >
            <b className="num">{hover.score}</b>
            <span>{hover.fc ? "forecast" : m.machine} · {hhmm(hover.time)}</span>
          </div>
        )}
      </div>
      <div className="legend">
        <span><i className="sw sw-main" />{m.machine}</span>
        <span><i className="sw" />other machines</span>
        {m.forecast.length > 0 && <span><i className="sw sw-fc" />forecast</span>}
        <span><i className="sw sw-zone-warn" />warning zone</span>
        <span><i className="sw sw-zone-reject" />reject zone</span>
      </div>
      <p className="muted small explain">
        Parts from this machine still pass, but how "unusual" they look to the anomaly model is tracked over time.
        A rising score means the machine is drifting, so maintenance can step in before the first defect.
      </p>
    </section>
  );
}
