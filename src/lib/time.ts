// Year handling.
//
// Internally every year is an *astronomical* year number: 1 BC = 0, 2 BC = -1,
// AD 1 = 1. The historical calendar has no year 0, so astronomical numbering is
// what makes subtraction and range checks correct. Conversion to "BC"/"西元前"
// happens only at display and input time.

import type { Lang } from '../i18n';

export const TIMELINE_MIN = -29999; // 30,000 BC: covers Taiwan's Paleolithic Changbin culture
export const TIMELINE_MAX = 2026;

export type Precision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'millennium';

export interface DatePoint {
  year: number; // astronomical
  month?: number;
  day?: number;
}

/** Astronomical year → the historical (BC/AD) number and era. */
export function toHistorical(year: number): { n: number; bc: boolean } {
  return year <= 0 ? { n: 1 - year, bc: true } : { n: year, bc: false };
}

/** Historical BC year (e.g. 200 for "200 BC") → astronomical year. */
export function fromBC(n: number): number {
  return 1 - n;
}

export function clampYear(y: number): number {
  return Math.min(TIMELINE_MAX, Math.max(TIMELINE_MIN, Math.round(y)));
}

export interface FormatOptions {
  lang: Lang;
  minguo?: boolean; // append 民國 year for 1912+
  approximate?: boolean;
  precision?: Precision;
}

export function formatYear(year: number, opts: FormatOptions): string {
  const { n, bc } = toHistorical(year);
  const approx = opts.approximate || opts.precision === 'century' || opts.precision === 'millennium';
  if (opts.lang === 'zh-TW') {
    let s = bc ? `西元前${n}年` : `${n}年`;
    if (approx) s = `約${s}`;
    if (opts.minguo && !bc && n >= 1912) s += `（民國${n - 1911}年）`;
    return s;
  }
  const s = bc ? `${n} BC` : n < 1000 ? `AD ${n}` : `${n}`;
  return approx ? `c. ${s}` : s;
}

/** Short tick label for the timeline axis. */
export function formatTick(year: number, lang: Lang): string {
  const { n, bc } = toHistorical(year);
  if (!bc) return String(n);
  if (n >= 10000) return lang === 'zh-TW' ? `前${n / 10000}萬` : `${n / 1000}k BC`;
  return lang === 'zh-TW' ? `前${n}` : `${n} BC`;
}

export function formatDate(d: DatePoint, opts: FormatOptions): string {
  const base = formatYear(d.year, { ...opts, minguo: false });
  const showMonth = d.month && opts.precision !== 'year' && opts.precision !== 'decade' &&
    opts.precision !== 'century' && opts.precision !== 'millennium';
  if (!showMonth) return formatYear(d.year, opts);
  if (opts.lang === 'zh-TW') {
    return `${base}${d.month}月${d.day && opts.precision === 'day' ? `${d.day}日` : ''}`;
  }
  const month = new Date(2000, (d.month ?? 1) - 1, 1).toLocaleString('en', { month: 'short' });
  return `${d.day && opts.precision === 'day' ? `${d.day} ` : ''}${month} ${base}`;
}

export function formatRange(start: DatePoint, end: DatePoint | undefined, opts: FormatOptions): string {
  const a = formatDate(start, opts);
  if (!end || (end.year === start.year && end.month === start.month && end.day === start.day)) return a;
  if (end.year === start.year && opts.precision !== 'day' && opts.precision !== 'month') return a;
  return `${a} – ${formatDate(end, { ...opts, approximate: opts.approximate })}`;
}

/**
 * Parse a year typed by a person. Accepts:
 *   "1661", "AD 200", "200 BC", "200 BCE", "-200" (read as 200 BC),
 *   "西元前200", "前200", "西元200", "民國50" (= 1961), "民國前1" (= 1911).
 * Returns an astronomical year, or null if it can't be read.
 */
export function parseYear(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '').replace(/年$/, '').toUpperCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^民國前(\d+)$/))) return 1912 - Number(m[1]);
  if ((m = s.match(/^民國(\d+)$/))) return 1911 + Number(m[1]);
  if ((m = s.match(/^(?:西元)?前(\d+)$/))) return fromBC(Number(m[1]));
  if ((m = s.match(/^(\d+)(?:BC|BCE|B\.C\.)$/))) return fromBC(Number(m[1]));
  if ((m = s.match(/^-(\d+)$/))) return fromBC(Number(m[1]));
  if ((m = s.match(/^(?:西元|AD|CE|A\.D\.)?(\d+)(?:AD|CE)?$/))) return Number(m[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Timeline scale. Recorded history gets denser over time, and Taiwan's written
// history starts around 1600, so the axis is piecewise-linear: each span of
// years maps to a fixed fraction of the slider's width.

const SCALE_YEARS = [TIMELINE_MIN, -3999, 0, 1000, 1600, 1900, TIMELINE_MAX];
const SCALE_POS = [0, 0.07, 0.17, 0.36, 0.58, 0.8, 1];

/** Year → position in [0, 1]. */
export function yearToPos(year: number): number {
  const y = Math.min(TIMELINE_MAX, Math.max(TIMELINE_MIN, year));
  for (let i = 1; i < SCALE_YEARS.length; i++) {
    if (y <= SCALE_YEARS[i]) {
      const t = (y - SCALE_YEARS[i - 1]) / (SCALE_YEARS[i] - SCALE_YEARS[i - 1]);
      return SCALE_POS[i - 1] + t * (SCALE_POS[i] - SCALE_POS[i - 1]);
    }
  }
  return 1;
}

/** Position in [0, 1] → year (rounded). */
export function posToYear(pos: number): number {
  const p = Math.min(1, Math.max(0, pos));
  for (let i = 1; i < SCALE_POS.length; i++) {
    if (p <= SCALE_POS[i]) {
      const t = (p - SCALE_POS[i - 1]) / (SCALE_POS[i] - SCALE_POS[i - 1]);
      return Math.round(SCALE_YEARS[i - 1] + t * (SCALE_YEARS[i] - SCALE_YEARS[i - 1]));
    }
  }
  return TIMELINE_MAX;
}

/** Axis ticks, densest where the scale is most stretched. */
export const TICKS = [
  -29999, -3999, -1999, 0, 500, 1000, 1200, 1400, 1600, 1700, 1800, 1900, 1950, 2000,
];
