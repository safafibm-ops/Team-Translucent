import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import { LEVELS, hhmm, nice, shortName } from "../format.js";

const VIEWS = [
  ["photo", "Photo"],
  ["boxes", "Defect boxes"],
  ["heatmap", "Heat-map"],
];

// What the system was unsure about, in words a reviewer can scan.
const why = (it) => (it.main_defect ? `Possible ${nice(it.main_defect).toLowerCase()}` : "Unusual surface");
// up to one decimal, never rounded up onto a review threshold (0.497 shows as 49.7%, not 50%)
const sure = (v) => `${+(v * 100).toFixed(1)}%`;
// the box the system named, picked the same way as the backend: worst severity, then highest confidence
const mainBox = (it) =>
  (it.defects ?? [])
    .filter((d) => d.defect === it.main_defect)
    .sort((a, b) => LEVELS.indexOf(b.severity) - LEVELS.indexOf(a.severity) || b.confidence - a.confidence)[0];
const evidence = (it) => {
  const c = mainBox(it)?.confidence ?? it.confidence;
  return [c != null ? `${sure(c)} sure` : null, it.anomaly_score != null ? `anomaly ${it.anomaly_score}` : null].filter(Boolean).join(" · ");
};

function Expanded({ item, index, total, busy, error, onClose, onPrev, onNext, onDecide }) {
  const [images, setImages] = useState(null);
  const [view, setView] = useState("photo");
  const [zoom, setZoom] = useState(null); // {x, y} in % while zoomed in
  const box = useRef(null);
  const keys = useRef({});
  keys.current = { onClose, onPrev, onNext, onDecide, busy, setView: (v) => images?.[v] && setView(v) };

  useEffect(() => {
    let live = true; // ignore a slow answer for a part the viewer has already left
    setImages(null);
    setZoom(null);
    api.reviewImages(item.id).then((r) => live && setImages(r)).catch(() => live && setImages({}));
    return () => {
      live = false;
    };
  }, [item.id]);

  // keyboard: Esc closes, arrows move through the queue, P / R decide (only while this viewer is open)
  useEffect(() => {
    const key = (e) => {
      const k = keys.current;
      if (e.key === "Escape") return k.onClose();
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea")) return;
      const pick = { 1: "photo", 2: "boxes", 3: "heatmap" }[e.key];
      if (pick) k.setView(pick);
      else if (e.key === "ArrowLeft") k.onPrev?.();
      else if (e.key === "ArrowRight") k.onNext?.();
      else if (!k.busy && (e.key === "p" || e.key === "P")) k.onDecide("pass");
      else if (!k.busy && (e.key === "r" || e.key === "R")) k.onDecide("reject");
    };
    window.addEventListener("keydown", key);
    const prevFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      if (prevFocus?.isConnected) prevFocus.focus();
      else document.querySelector("#review h2")?.focus();
    };
  }, []);

  const src = images?.[view] ?? images?.photo;
  const pos = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: (100 * (e.clientX - b.left)) / b.width, y: (100 * (e.clientY - b.top)) / b.height };
  };

  // drawn at the end of the page so the sticky header and panels can never sit on top of it
  return createPortal(
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Photo of ${item.part}`}>
      <div className="expanded" onClick={(e) => e.stopPropagation()} ref={box} tabIndex={-1}>
        <div className="stage">
          <div className="vtabs" role="group" aria-label="Picture">
            {VIEWS.map(([k, label]) => (
              <button key={k} className={view === k ? "sel" : ""} aria-pressed={view === k} disabled={!images?.[k]} onClick={() => setView(k)}
                aria-keyshortcuts={String(VIEWS.findIndex(([x]) => x === k) + 1)}>
                {label}
              </button>
            ))}
          </div>
          {src ? (
            <div
              className={`zoomer ${zoom ? "on" : ""}`}
              onClick={(e) => setZoom(zoom ? null : pos(e))}
              onMouseMove={(e) => zoom && setZoom(pos(e))}
            >
              <img
                src={src}
                alt={item.part}
                style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              />
            </div>
          ) : (
            <div className="stage-loading"><span className="spin" />Loading the photo…</div>
          )}
          <span className="tag">{zoom ? "Click to zoom out · move to look around" : "Click the photo to zoom in"}</span>
        </div>

        <aside className="side">
          <div className="side-top">
            <span className="eyebrow num">Part {index + 1} of {total}</span>
            <button className="icon-btn x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
          </div>
          <div className="ex-title">
            <b>{why(item)}</b>
            <span className="mono" title={item.part}>{shortName(item.part)}</span>
          </div>
          <p className="side-reason">{item.reason}</p>
          <dl className="side-meta">
            <div><dt>Evidence</dt><dd className="num">{evidence(item) || "–"}</dd></div>
            <div><dt>Machine</dt><dd className="mono">{item.machine}</dd></div>
            <div><dt>Severity</dt><dd>{item.severity ?? "–"}</dd></div>
            <div><dt>Checked</dt><dd className="num">{hhmm(item.time)}</dd></div>
          </dl>
          {item.defects?.length > 0 && (
            <ul className="side-boxes">
              {item.defects.map((d, i) => (
                <li key={i}><span>{nice(d.defect)}</span><span className="num">{sure(d.confidence)}</span></li>
              ))}
            </ul>
          )}
          {error && <div className="note err" role="alert">{error}</div>}
          <div className="side-actions">
            <button className="decide pass" disabled={busy} onClick={() => onDecide("pass")} aria-keyshortcuts="P">
              <Icon name="check" size={18} />Pass<kbd>P</kbd>
            </button>
            <button className="decide reject" disabled={busy} onClick={() => onDecide("reject")} aria-keyshortcuts="R">
              <Icon name="cross" size={18} />Reject<kbd>R</kbd>
            </button>
          </div>
          <div className="side-nav">
            <button className="btn" onClick={onPrev} disabled={!onPrev} aria-label="Previous part"><Icon name="left" />Previous</button>
            <button className="btn" onClick={onNext} disabled={!onNext} aria-label="Next part">Next<Icon name="right" /></button>
          </div>
          <p className="side-hint"><Icon name="keyboard" size={14} />P pass · R reject · ← → move · 1 2 3 picture · Esc close. The next part opens after each decision.</p>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

export default function ReviewQueue({ items, labelsSaved, onLabelled }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [failedId, setFailedId] = useState(null); // part whose save failed in the large viewer

  async function decide(id, label) {
    setBusy(true);
    try {
      const res = await api.label(id, label);
      const item = items.find((x) => x.id === id);
      setNote(`${item?.part ?? "Part"} marked ${res.decision} by a person.`);
      await onLabelled(res.id, res.decision);
      return true;
    } catch (err) {
      setNote(`Could not save: ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const index = items.findIndex((x) => x.id === open);
  const current = items[index];
  const prev = index > 0 ? items[index - 1].id : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1].id : null;

  // deciding from the large viewer moves straight on to the next part in the queue
  // (only if the person is still looking at that part; closing or moving on meanwhile wins)
  async function decideOpen(label) {
    const id = current.id;
    const after = next ?? prev;
    const saved = await decide(id, label);
    setFailedId(saved ? null : id);
    if (saved) setOpen((o) => (o === id ? after : o));
  }

  return (
    <section className="panel queue-panel" id="review">
      <div className="ph">
        <div className="ph-title">
          <h2 tabIndex={-1}>Review queue {items.length > 0 && <span className="count c-review">{items.length}</span>}</h2>
          <p className="sub">A person decides on parts the system is unsure about. Each decision is saved to retrain the models.</p>
        </div>
        <span className="chip-stat num" title="Decisions saved as training labels">
          <Icon name="layers" size={14} />
          {labelsSaved} {labelsSaved === 1 ? "label" : "labels"} saved
        </span>
      </div>
      {note && <div className={`note ${note.startsWith("Could not") ? "err" : ""}`} role="status">{note}</div>}
      {items.length === 0 ? (
        <div className="empty">
          <span className="empty-icon"><Icon name="check" size={22} /></span>
          <b>Nothing waiting</b>
          <span>Parts the system is unsure about appear here for a person to check.</span>
        </div>
      ) : (
        <div className="queue">
          {items.map((it) => (
            <div className="qi" key={it.id}>
              <button className="qopen" data-test="review-open" onClick={() => setOpen(it.id)} title="Open large to inspect">
                <img src={it.thumb} alt={it.part} />
                <span className="qzoom" aria-hidden="true"><Icon name="expand" size={13} /></span>
              </button>
              <div className="qbody">
                <div className="qwhy">{why(it)}</div>
                <div className="qev num">{evidence(it)}</div>
                <div className="qmeta">
                  <span className="mono">{it.machine}</span>
                  <span className="sep">·</span>
                  <span className="qname mono" title={it.part}>{shortName(it.part)}</span>
                </div>
              </div>
              <div className="qa">
                <button className="pass" disabled={busy} onClick={() => decide(it.id, "pass")}><Icon name="check" size={15} />Pass</button>
                <button className="reject" disabled={busy} onClick={() => decide(it.id, "reject")}><Icon name="cross" size={15} />Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {current && (
        <Expanded
          item={current}
          index={index}
          total={items.length}
          busy={busy}
          error={failedId === current.id ? note : ""}
          onClose={() => setOpen(null)}
          onPrev={prev != null ? () => setOpen(prev) : null}
          onNext={next != null ? () => setOpen(next) : null}
          onDecide={decideOpen}
        />
      )}
    </section>
  );
}
