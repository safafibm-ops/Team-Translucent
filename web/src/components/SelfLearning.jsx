import { useEffect, useState } from "react";
import { api } from "../api.js";

// Anomaly model learning from the review queue: every Pass is a confirmed good part.
// After enough of them, the server retrains on its own and keeps the new model only if it passes the exam.
export default function SelfLearning({ data, onChange }) {
  const [live, setLive] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [note, setNote] = useState("");
  const s = live ?? data;
  const running = s?.state === "running";

  useEffect(() => setLive(null), [data]);

  // poll fast while a retrain runs, then let the dashboard refresh everything once it ends
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const next = await api.retrain().catch(() => null);
      if (!next) return;
      setLive(next);
      if (next.state !== "running") onChange();
    }, 1500);
    return () => clearInterval(t);
  }, [running, onChange]);

  async function pick(v) {
    setSwitching(v);
    try {
      setLive(await api.useVersion(v));
      setNote(`Inspection now uses version ${v}${v === 1 ? " (the original model)" : ""}.`);
      onChange();
    } catch (err) {
      setNote(`Could not switch: ${err.message}`);
    } finally {
      setSwitching(null);
    }
  }

  if (!s) return null;
  const last = s.history?.[0];
  const waiting = Math.min(s.waiting, s.needed);

  return (
    <section className="card" id="learning">
      <div className="h">
        Self-learning · anomaly model
        <span className="r violet">using version {s.version}</span>
      </div>

      <div className="versions">
        <span className="muted small">Versions</span>
        {(s.versions ?? []).map((v) => (
          <button
            key={v.version}
            className={v.version === s.version ? "sel" : ""}
            disabled={running || switching !== null || v.version === s.version}
            onClick={() => pick(v.version)}
            title={v.version === 1 ? "Original model from training" : `${v.photos} good parts learned · ${v.time ? new Date(v.time).toLocaleString() : ""}`}
          >
            v{v.version}
            <span>{v.version === 1 ? "original" : `+${v.photos} parts`}</span>
          </button>
        ))}
      </div>
      {note && <div className="note">{note}</div>}

      {running ? (
        <div className="learn">
          <div className="learn-row">
            <span className="spin" aria-hidden="true" />
            <b>Retraining</b>
            <span className="muted small">{s.step}</span>
          </div>
          <div className="track">
            <div className="fill bg-violet" style={{ width: `${Math.round(100 * s.progress)}%` }} />
          </div>
          <div className="muted small">Inspection keeps running on the current model meanwhile.</div>
        </div>
      ) : (
        <div className="learn">
          <div className="learn-row">
            <b>{waiting} of {s.needed}</b>
            <span className="muted small">
              good parts confirmed by inspectors · retraining starts by itself at {s.needed}
            </span>
          </div>
          <div className="steps">
            {Array.from({ length: s.needed }, (_, i) => (
              <span key={i} className={i < waiting ? "on" : ""} />
            ))}
          </div>
          {s.error && <div className="red small">{s.error}</div>}
        </div>
      )}

      {last && (
        <div className={`learn-last ${last.accepted ? "accepted" : "kept"}`}>
          <b className={last.accepted ? "green" : "amber"}>
            Last retrain: {last.accepted ? `created version ${last.version}` : `failed the exam, kept version ${last.version}`}
          </b>
          <span className="muted small"> · {new Date(last.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {last.seconds} s{last.device ? ` on ${last.device}` : ""}</span>
          <div className="tiles">
            <div>
              <span>Anomaly score of the {last.photos} parts</span>
              <b>
                {last.score_before} → <b className={last.score_after < last.score_before ? "green" : ""}>{last.score_after}</b>
              </b>
            </div>
            <div>
              <span>Exam: defect photos caught</span>
              <b className={last.accepted ? "green" : "red"}>
                {last.new ? `${last.new.caught}/${last.new.defect}` : "not checked"}
              </b>
            </div>
            <div>
              <span>New patterns learned</span>
              <b>{last.patterns_added}</b>
            </div>
          </div>
          <div className="muted small why">
            {last.accepted ? "Passed the exam: " : "Failed the exam, old model kept: "}
            {last.reason}.
          </div>
        </div>
      )}
      <div className="muted small foot-note">
        Exam set: {s.exam?.defect ?? 0} defect photos{s.exam?.good ? ` and ${s.exam.good} good photos` : ""}, never used for training.
        Rejected parts are saved for the defect model.
      </div>
    </section>
  );
}
