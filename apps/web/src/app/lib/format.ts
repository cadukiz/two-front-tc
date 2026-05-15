/**
 * Display formatting helpers, ported from the design's `lib/utils.js`
 * (.js → .ts). The design's `uid()` is intentionally dropped — ids come
 * from the server (ADR-0006); the client never mints them.
 *
 * All inputs are epoch-ms numbers (the domain's display-only `createdAt` /
 * `completedAt`); ordering is by `seq`, never by these values.
 */

/** Human "time ago" label, clamped at zero (no negative ages). */
export function relativeAge(then: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** `HH:MM:SS`, zero-padded, local time. */
export function formatTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** `Mon D, HH:MM:SS` — short month + day + `formatTime`. */
export function formatDateTime(t: number): string {
  const d = new Date(t);
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()}, ${formatTime(t)}`;
}
