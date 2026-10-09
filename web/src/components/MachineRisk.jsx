// grey means normal; colour only when a machine needs attention
const tone = (p) => (p >= 30 ? "reject" : p >= 15 ? "review" : "ok");

export default function MachineRisk({ risk }) {
  const alarms = risk.filter((m) => m.spc_alarm).map((m) => m.machine);
  return (
    <section className="panel" id="machines">
      <div className="ph">
        <div className="ph-title">
          <h2>Machine risk</h2>
          <p className="sub">Chance of a defect in the next parts · LightGBM + SPC</p>
        </div>
      </div>
      {risk.length === 0 ? (
        <div className="skeleton-rows" role="status" aria-label="Loading machine risk"><i /><i /><i /><i /></div>
      ) : (
        <>
          <div className="mlist">
            {risk.map((m) => {
              const p = m["predicted_risk_%"];
              return (
                <div className={`mrow r-${tone(p)}`} key={m.machine}>
                  <b className="mono m-name">{m.machine}</b>
                  <div className="track scale" aria-hidden="true">
                    <div className="fill" style={{ width: `${Math.min(100, p)}%` }} />
                  </div>
                  <b className="num m-val">{p}%</b>
                  <span className="m-detail small">
                    {m.spc_alarm && <span className="flag">SPC alarm</span>}
                    <span className="muted">
                      {m.main_defect === "none" ? "normal" : `mostly ${m.main_defect}`} · recent {m["defect_rate_recent_%"]}%
                    </span>
                  </span>
                </div>
              );
            })}
            <div className="mrow axis-row" aria-hidden="true">
              <span />
              <div className="scale-axis num"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
            </div>
          </div>
        </>
      )}
      <dl className="facts">
        <div>
          <dt>Defect model</dt>
          <dd className="mono">mAP50 0.75</dd>
        </div>
        <div>
          <dt>Anomaly model</dt>
          <dd className="mono">AUROC 0.96</dd>
        </div>
        <div>
          <dt>SPC alarm</dt>
          <dd className={alarms.length ? "t-reject" : ""}>{alarms.length ? `${alarms.join(", ")} out` : "none"}</dd>
        </div>
      </dl>
    </section>
  );
}
