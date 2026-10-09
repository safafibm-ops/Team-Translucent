import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import { hhmm } from "../format.js";

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

  if (!s) {
    return (
      <section className="panel" id="learning">
        <div className="ph"><div className="ph-title"><h2>Self-learning</h2><p className="sub">The anomaly model learns from parts inspectors pass</p></div></div>
        <div className="skeleton-rows" role="status" aria-label="Loading self-learning"><i /><i /><i /></div>
      </section>
    );
  }
  const last = s.history?.[0];
  const examined = s.exam?.defect || s.exam?.good; // with no exam photos the backend keeps a new version unchecked
  const waiting = Math.min(s.waiting, s.needed);

  return (
    <section className="panel" id="learning">
      <div className="ph">
        <div className="ph-title">
          <h2>Self-learning</h2>
          <p className="sub">The anomaly model learns from parts inspectors pass</p>
        </div>
        <span className="chip-stat accent num"><Icon name="layers" size={14} />using v{s.version}</span>
      </div>

      <ol className="flow" aria-label="How self-learning works">
        <li><span className="flow-n">1</span>An inspector passes a part in the review queue</li>
        <li><span className="flow-n">2</span>At {s.needed} confirmed good parts the model retrains by itself</li>
        {examined ? (
          <>
            <li><span className="flow-n">3</span>It sits an exam on defect photos never used for training</li>
            <li><span className="flow-n">4</span>The new version is kept only if it passes</li>
          </>
        ) : (
          <li><span className="flow-n">3</span>No exam photos found, so a new version is used without a check</li>
        )}
      </ol>

      {running ? (
        <div className="learn running">
          <div className="learn-row">
            <span className="spin" aria-hidden="true" />
            <b>Retraining</b>
            <span className="muted small">{s.step}</span>
            <span className="num learn-pct">{Math.round(100 * s.progress)}%</span>
          </div>
          <div className="track big">
            <div className="fill" style={{ width: `${Math.round(100 * s.progress)}%` }} />
          </div>
          <div className="muted small">Inspection keeps running on the current model meanwhile.</div>
        </div>
      ) : (
        <div className="learn">
          <div className="learn-row">
            <b className="num learn-count">{waiting} <span>of {s.needed}</span></b>
            <span className="muted small">
              good parts confirmed by inspectors · retraining starts by itself at {s.needed}
            </span>
          </div>
          <div className="steps" aria-hidden="true">
            {Array.from({ length: s.needed }, (_, i) => (
              <span key={i} className={i < waiting ? "on" : ""} />
            ))}
          </div>
          {s.error && <div className="t-reject small">{s.error}</div>}
        </div>
      )}

      <div className="versions">
        <div className="versions-head">
          <span className="eyebrow">Model versions</span>
          <span className="muted small">pick one to switch inspection to it</span>
        </div>
        <div className="vlist">
          {(s.versions ?? []).map((v) => (
            <button
              key={v.version}
              className={`ver ${v.version === s.version ? "sel" : ""}`}
              disabled={running || switching !== null || v.version === s.version}
              aria-pressed={v.version === s.version}
              onClick={() => pick(v.version)}
              title={v.version === 1 ? "Original model from training" : `${v.photos} good parts learned · ${v.time ? new Date(v.time).toLocaleString() : ""}`}
            >
              <b className="num">v{v.version}</b>
              <span>{v.version === 1 ? "original" : `+${v.photos} parts`}</span>
              {v.version === s.version && <em>in use</em>}
              {switching === v.version && <span className="spin" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
      {note && <div className={`note ${note.startsWith("Could not") ? "err" : ""}`} role="status">{note}</div>}

      {last && (
        <div className={`learn-last ${last.accepted ? "accepted" : "kept"}`}>
          <div className="last-head">
            <span className="last-icon"><Icon name={last.accepted ? "check" : "warn"} size={16} /></span>
            <b>Last retrain: {last.accepted ? `created version ${last.version}` : `failed the exam, kept version ${last.version}`}</b>
            <span className="muted small num">{hhmm(last.time)} · {last.seconds} s{last.device ? ` on ${last.device}` : ""}</span>
          </div>
          <div className="tiles">
            <div>
              <span>Anomaly score of the {last.photos} parts</span>
              <b className="num">
                {last.score_before} <span className="arrow">→</span> <b className={last.score_after < last.score_before ? "t-pass" : ""}>{last.score_after}</b>
              </b>
            </div>
            <div>
              <span>Exam: defect photos caught</span>
              <b className={`num ${last.accepted ? "t-pass" : "t-reject"}`}>
                {last.new ? `${last.new.caught}/${last.new.defect}` : "not checked"}
              </b>
            </div>
            <div>
              <span>New patterns learned</span>
              <b className="num">{last.patterns_added}</b>
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
