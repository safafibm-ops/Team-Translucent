// Small wrapper around the FastAPI endpoints in api.py.
async function call(path, options) {
  const r = await fetch(path, options);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `${path} failed (${r.status})`);
  return body;
}

const json = (data) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const api = {
  health: () => call("/health"),
  summary: () => call("/summary"),
  review: () => call("/review"),
  earlyWarning: () => call("/early-warning"),
  risk: () => call("/machines/risk"),
  retrain: () => call("/retrain"),
  rules: () => call("/rules"),
  setRules: ({ ignore_below, reject_above, anomaly_review }) =>
    call("/rules", json({ ignore_below, reject_above, anomaly_review })),
  useVersion: (version) => call("/retrain/use", json({ version })),
  inspect: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return call("/inspect", { method: "POST", body: fd });
  },
  reviewImages: (id) => call(`/review/${id}/images`),
  label: (id, label) => call(`/review/${id}`, json({ label })),
  workOrder: (machine, action, part) => call("/work-orders", json({ machine, action, part })),
};
