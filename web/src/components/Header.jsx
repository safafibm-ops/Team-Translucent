import { useState } from "react";
import Icon from "./Icon.jsx";

export const TABS = [
  ["inspect", "Inspection"],
  ["line", "Line health"],
  ["models", "Models & rules"],
];
const TAB_ICON = { inspect: "scan", line: "pulse", models: "sliders" };
const THEME_COLOR = { light: "#f4f5f7", dark: "#0b0d10" };

const currentTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

// Light for bright factory floors and projectors, dark for night shifts. Remembered on this computer only.
function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  function toggle() {
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[next]);
    try {
      localStorage.setItem("qi-theme", next);
    } catch {
      /* private window: the choice just isn't remembered */
    }
    setTheme(next);
  }
  return (
    <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}

// Top bar: product name, the three work areas, model status and the clock.
export default function Header({ tab, onTab, health, reviewCount, alerts, learning, clock }) {
  const loaded = health?.defect_model && health?.anomaly_model;
  const retraining = learning?.state === "running";
  const state = health == null ? "wait" : loaded ? "ok" : "bad";
  return (
    <header className="topbar">
      <div className="topbar-in">
        <div className="brand">
          <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="2.5" y="2.5" width="27" height="27" rx="8" />
            <path d="M9.5 16.5 14 21 22.5 11.5" />
          </svg>
          <div className="brand-text">
            <b>Translucent QI</b>
            <span>Cast aluminium line</span>
          </div>
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map(([key, label]) => (
            <button key={key} className={`tab ${tab === key ? "on" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
              <Icon name={TAB_ICON[key]} size={17} />
              <span className="tab-label">{label}</span>
              {key === "inspect" && reviewCount > 0 && <span className="count c-review" title="Parts waiting for a person">{reviewCount}</span>}
              {key === "line" && alerts > 0 && <span className="count c-reject" title="Machines needing attention">{alerts}</span>}
              {key === "models" && retraining && <span className="pulse" title="Retraining now" />}
            </button>
          ))}
        </nav>

        <div className="status">
          <span className={`health h-${state}`} title={`Defect model ${health?.defect_model ? "loaded" : "missing"} · anomaly model ${health?.anomaly_model ? "loaded" : "missing"}`}>
            <i aria-hidden="true">{state === "ok" ? <Icon name="check" size={11} /> : state === "bad" ? <Icon name="cross" size={11} /> : null}</i>
            <span className="health-text">{health == null ? "Connecting" : loaded ? "Models ready" : "Model missing"}</span>
          </span>
          <span className="clock num" title="Local time">
            <Icon name="clock" size={15} />
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <ThemeToggle />
          <a className="icon-btn api-link" href="/docs" target="_blank" rel="noreferrer" title="API documentation">
            <Icon name="doc" size={16} />
            <span>API</span>
          </a>
        </div>
      </div>
    </header>
  );
}
