export default function Sidebar({ health, reviewCount }) {
  const dot = (ok) => <span className={`dot ${ok ? "on" : "off"}`} />;
  return (
    <aside className="side">
      <div className="logo">
        <div className="mark" />
        Translucent QI
      </div>
      <a className="nav on" href="#top">Live line</a>
      <a className="nav" href="#review">
        Review queue {reviewCount > 0 && <span className="count">{reviewCount}</span>}
      </a>
      <a className="nav" href="#early">Early warning</a>
      <a className="nav" href="#machines">Machines</a>
      <a className="nav" href="/docs" target="_blank" rel="noreferrer">API docs</a>
      <div className="side-foot">
        <div>{dot(health?.defect_model)}Defect model {health?.defect_model ? "loaded" : "missing"}</div>
        <div>{dot(health?.anomaly_model)}Anomaly model {health?.anomaly_model ? "loaded" : "missing"}</div>
        <div>{dot(true)}CPU only · no graphics card</div>
      </div>
    </aside>
  );
}
