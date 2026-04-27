/** Tailwind class strings: soft background + strong readable text, distinct hues */
const LOCATION_PILL_STYLES = [
  "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-100/90 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/60",
  "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100/90 dark:bg-emerald-950/45 dark:text-emerald-200 dark:hover:bg-emerald-950/60",
  "border-transparent bg-amber-100 text-amber-900 hover:bg-amber-100/90 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/65",
  "border-transparent bg-violet-100 text-violet-800 hover:bg-violet-100/90 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950/65",
  "border-transparent bg-pink-100 text-pink-800 hover:bg-pink-100/90 dark:bg-pink-950/50 dark:text-pink-200 dark:hover:bg-pink-950/65",
  "border-transparent bg-indigo-100 text-indigo-800 hover:bg-indigo-100/90 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-950/65",
  "border-transparent bg-teal-100 text-teal-800 hover:bg-teal-100/90 dark:bg-teal-950/50 dark:text-teal-200 dark:hover:bg-teal-950/65",
  "border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100/90 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950/65",
  "border-transparent bg-cyan-100 text-cyan-800 hover:bg-cyan-100/90 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:bg-cyan-950/65",
] as const;

function hashLocation(s: string): number {
  const key = s.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic color classes per location string. */
export function getLocationColor(location: string): string {
  if (!location.trim()) {
    return LOCATION_PILL_STYLES[0];
  }
  const i = hashLocation(location) % LOCATION_PILL_STYLES.length;
  return LOCATION_PILL_STYLES[i] ?? LOCATION_PILL_STYLES[0];
}
