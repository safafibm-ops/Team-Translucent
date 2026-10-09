// Small inline icon set, one stroke weight, so no icon library is needed.
const PATHS = {
  upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  expand: <><path d="M14 4h6v6" /><path d="M10 20H4v-6" /><path d="m20 4-7 7" /><path d="m4 20 7-7" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  warn: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4" /><path d="M12 17.2v.1" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cross: <><path d="M7 7l10 10" /><path d="M17 7 7 17" /></>,
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3l6.5-6.5zM14.5 6.5 17 4l3 3-2.5 2.5" />,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3.5" /></>,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M10 10h4v4h-4z" /><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  flame: <path d="M12 21c4 0 7-2.7 7-6.7 0-3.3-2-5.3-3.5-7.3-.4 2-1.5 3-2.5 3.5C13 7 11.5 4.5 9 3c.3 3-1.5 5-3 7a7.4 7.4 0 0 0-1 4.3C5 18.3 8 21 12 21z" />,
  square: <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m20.5 16-5-5-8.5 8.5" /></>,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4.5V9H8" /><path d="M12 8v4.5l3 1.8" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z" /><path d="m9 12 2 2 4-4.5" /></>,
  machine: <><rect x="3.5" y="9" width="17" height="10" rx="1.5" /><path d="M7 9V5h4v4M15 13h2M7 13h4" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  sparkle: <path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z" />,
};

export default function Icon({ name, size = 16, className = "" }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
