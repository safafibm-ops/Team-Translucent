import { useEffect, useState } from "react";
import { api } from "../api.js";

const VIEWS = [
  ["photo", "Photo"],
  ["boxes", "Defect boxes"],
  ["heatmap", "Heat-map"],
];

function Expanded({ item, onClose }) {
  const [images, setImages] = useState(null);
  const [view, setView] = useState("photo");
  const [zoom, setZoom] = useState(null); // {x, y} in % while zoomed in

  useEffect(() => {
    api.reviewImages(item.id).then(setImages).catch(() => setImages({}));
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [item.id, onClose]);

  const src = images?.[view] ?? images?.photo;
  const pos = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: (100 * (e.clientX - b.left)) / b.width, y: (100 * (e.clientY - b.top)) / b.height };
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="expanded" onClick={(e) => e.stopPropagation()}>
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
          <div className="muted">Loading the photo…</div>
        )}
        <div className="vtabs">
          {VIEWS.map(([k, label]) => (
            <button key={k} className={view === k ? "sel" : ""} disabled={!images?.[k]} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <span className="tag">{zoom ? "Click to zoom out · move to look around" : "Click the photo to zoom in"}</span>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>
    </div>
  );
}

export default function ReviewQueue({ items, labelsSaved, onLabelled }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");

  async function decide(id, label) {
    setBusy(true);
    try {
      const res = await api.label(id, label);
      const item = items.find((x) => x.id === id);
      setNote(`${item?.part ?? "Part"} marked ${res.decision} by a person.`);
      await onLabelled(res.id, res.decision);
    } catch (err) {
      setNote(`Could not save: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const current = items.find((x) => x.id === open);

  return (
    <section className="card grow" id="review">
      <div className="h">
        Review queue · a person decides, labels retrain the models
        <span className="r violet">
          {labelsSaved} {labelsSaved === 1 ? "label" : "labels"} saved for retraining
        </span>
      </div>
      {note && <div className="note">{note}</div>}
      {items.length === 0 ? (
        <div className="empty">Nothing waiting. Parts the system is unsure about appear here for a person to check.</div>
      ) : (
        <div className="queue">
          {items.map((it) => (
            <div className="qi" key={it.id}>
              <button className="qopen" onClick={() => setOpen(it.id)} title="Expand to inspect">
                <img src={it.thumb} alt={it.part} />
                <span className="qzoom" aria-hidden="true">⤢</span>
              </button>
              <div className="qs">
                <span>{it.main_defect ? `${it.main_defect}? ${it.confidence}` : `anomaly ${it.anomaly_score}`}</span>
                <span>{it.machine}</span>
              </div>
              <div className="qname" title={it.part}>{it.part}</div>
              <div className="qa">
                <button className="ok" disabled={busy} onClick={() => decide(it.id, "pass")}>Pass</button>
                <button className="no" disabled={busy} onClick={() => decide(it.id, "reject")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {current && <Expanded item={current} onClose={() => setOpen(null)} />}
    </section>
  );
}
