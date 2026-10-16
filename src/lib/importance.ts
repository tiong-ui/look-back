// Importance ("how major is this event?") on a 1–5 scale.
//
// Computed from two Wikipedia signals, fetched by scripts/compute-importance.ts:
//   - sitelinks: how many Wikipedia language editions have an article (Wikidata)
//   - page views: last 12 months of views on English and Chinese Wikipedia
// Both are log-scaled, since they span several orders of magnitude.
// Editors can nudge the result with `importanceBoost`, and data/config.yaml adds
// a per-region boost so the Taiwan-centred view isn't drowned out by
// globally famous events.

export interface WikiSignals {
  sitelinks: number;
  viewsEn: number;
  viewsZh: number;
}

const norm = (v: number, max: number) => Math.min(1, Math.max(0, Math.log10(v + 1) / Math.log10(max + 1)));

/** Raw score in [0, 1]. */
export function wikiScore(s: WikiSignals): number {
  return 0.5 * norm(s.sitelinks, 200) + 0.25 * norm(s.viewsEn, 2_000_000) + 0.25 * norm(s.viewsZh, 500_000);
}

export const clampImportance = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

/** Score → 1–5. */
export function scoreToImportance(score: number): number {
  return clampImportance(1 + score * 4);
}

/** Minimum importance shown for a selected range width, so long ranges show only major events. */
export function thresholdForWidth(years: number): number {
  if (years > 1000) return 4;
  if (years > 200) return 3;
  if (years > 50) return 2;
  return 1;
}
