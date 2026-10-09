export default function Kpis({ summary: s }) {
  const types = s?.rejected_by_type
    ? Object.entries(s.rejected_by_type).map(([k, v]) => `${v} ${k}`).join(" · ")
    : "";
  const tiles = [
    { label: "Parts inspected", value: s?.inspected ?? 0, note: "this session" },
    {
      label: "First-pass yield",
      value: s?.first_pass_yield != null ? `${s.first_pass_yield}%` : "–",
      note: s?.reviewed ? `passed with no review · ${s.reviewed} checked by a person` : "passed with no review",
      tone: "green",
    },
    { label: "Rejected", value: s?.rejected ?? 0, note: types || "none yet", tone: "red" },
    { label: "Waiting for review", value: s?.waiting_review ?? 0, note: `${s?.labels_saved ?? 0} ${s?.labels_saved === 1 ? "label" : "labels"} saved`, tone: "amber" },
    {
      label: "Check time per part",
      value: s?.avg_check_ms != null ? `${(s.avg_check_ms / 1000).toFixed(2)} s` : "–",
      note: "average, no graphics card",
    },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div className="card kpi" key={t.label}>
          <div className="l">{t.label}</div>
          <div className={`v ${t.tone || ""}`}>{t.value}</div>
          <div className="d">{t.note}</div>
        </div>
      ))}
    </div>
  );
}
