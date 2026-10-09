const tone = (p) => (p >= 30 ? "red" : p >= 15 ? "amber" : "green");

export default function MachineRisk({ risk }) {
  const alarms = risk.filter((m) => m.spc_alarm).map((m) => m.machine);
  return (
    <section className="card grow" id="machines">
      <div className="h">
        Machine risk · next parts <span className="r muted">LightGBM + SPC</span>
      </div>
      {risk.map((m) => {
        const p = m["predicted_risk_%"];
        return (
          <div className="mrow" key={m.machine}>
            <b>{m.machine}</b>
            <div className="track">
              <div className={`fill bg-${tone(p)}`} style={{ width: `${Math.min(100, p)}%` }} />
            </div>
            <b className={tone(p)}>{p}%</b>
            <span className="muted small">
              {m.spc_alarm ? "SPC alarm · " : ""}
              {m.main_defect === "none" ? "normal" : `mostly ${m.main_defect}`} · recent {m["defect_rate_recent_%"]}%
            </span>
          </div>
        );
      })}
      <div className="tiles">
        <div>
          <span>Defect model</span>
          <b>mAP50 0.75</b>
        </div>
        <div>
          <span>Anomaly model</span>
          <b>AUROC 0.96</b>
        </div>
        <div>
          <span>SPC alarm</span>
          <b className={alarms.length ? "red" : "green"}>{alarms.length ? `${alarms.join(", ")} out` : "none"}</b>
        </div>
      </div>
    </section>
  );
}
