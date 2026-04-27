/** Relative label for list cards / tables (Eastern US locale assumed fine for student board). */
export function formatAddedAgo(iso: string): string {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return "—";
  const start = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const diff = Math.floor((start(now) - start(created)) / 86_400_000);
  if (diff <= 0) return "Added today";
  if (diff === 1) return "Added 1 day ago";
  return `Added ${diff} days ago`;
}

/**
 * Heuristic for NYC metro branding on location pills.
 * Matches "New York", "NYC", or common "..., NY" patterns.
 */
export function isNycLocationLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/nyc|new\s+york/i.test(t)) return true;
  if (/\bNY\b/.test(t)) return true;
  if (/,\s*NY\s*$/i.test(t) || /^\s*NY\s*,/i.test(t)) return true;
  return false;
}
