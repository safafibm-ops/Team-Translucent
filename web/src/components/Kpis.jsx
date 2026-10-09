// Session numbers. Colour only marks something a person should look at (rejects, parts waiting).
export default function Kpis({ summary: s }) {
  const byType = s?.rejected_by_type ? Object.entries(s.rejected_by_type) : [];
  const types = byType.map(([k, v]) => `${v} ${k}`).join(" · ");
  const rejectedTotal = byType.reduce((n, [, v]) => n + v, 0);
  const tiles = [
    { label: "Parts inspected", value: s?.inspected ?? 0, note: "this session" },
    {
      label: "First-pass yield",
      value: s?.first_pass_yield != null ? `${s.first_pass_yield}%` : "–",
      note: s?.reviewed ? `passed with no review · ${s.reviewed} checked by a person` : "passed with no review",
      meter: s?.first_pass_yield,
    },
    { label: "Rejected", value: s?.rejected ?? 0, note: types || "none yet", tone: s?.rejected > 0 ? "reject" : "", split: rejectedTotal > 0 },
    {
      label: "Waiting for review",
      value: s?.waiting_review ?? 0,
      note: `${s?.labels_saved ?? 0} ${s?.labels_saved === 1 ? "label" : "labels"} saved`,
      tone: s?.waiting_review > 0 ? "review" : "",
    },
    {
      label: "Check time per part",
      value: s?.avg_check_ms != null ? `${(s.avg_check_ms / 1000).toFixed(2)} s` : "–",
      note: "average, no graphics card",
    },
  ];
  return (
    <div className={`kpis ${s ? "" : "loading"}`} aria-busy={s ? undefined : true}>
      {tiles.map((t) => (
        <div className={`kpi ${t.tone ? `t-${t.tone}` : ""}`} key={t.label}>
          <div className="kpi-l">
            {t.tone && <i className="kpi-dot" aria-hidden="true" />}
            {t.label}
          </div>
          <div className="kpi-v num">{s ? t.value : <span className="sk sk-num" />}</div>
          {t.meter != null && (
            <div className="kpi-meter" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.max(0, t.meter))}%` }} />
            </div>
          )}
          {t.split && (
            <div className="kpi-split" aria-hidden="true">
              {byType.map(([k, v]) => (
                <i key={k} style={{ flexGrow: v }} title={`${v} ${k}`} />
              ))}
            </div>
          )}
          <div className="kpi-d" title={t.note}>{s ? t.note : " "}</div>
        </div>
      ))}
    </div>
  );
}
