// Display helpers only: they change how values look, never what they mean.

// "cast_def_0_1493_jpeg.rf.04a05….jpg" -> "cast_def_0_1493" (the full name stays in tooltips)
export const shortName = (part = "") =>
  part.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_(jpe?g|png|bmp|webp)\.rf\.[0-9a-f]+$/i, "") || part;

export const nice = (s = "") => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const pct = (v) => `${Math.round(v * 100)}%`;

export const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const LEVELS = ["Low", "Medium", "High", "Critical"];
