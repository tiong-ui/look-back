import type { Lang } from '../i18n';
import type { Category } from './categories';
import { thresholdForWidth } from './importance';
import type { AtlasEvent, Place } from './types';

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface EventFilter {
  from: number;
  to: number;
  categories: Set<Category>; // empty = all
  showAll: boolean; // ignore the importance threshold
  includeImported?: boolean; // include unreviewed events imported from Wikidata (default true)
  placeId?: string;
  bounds?: Bounds; // only events with a location inside
}

export const overlaps = (e: AtlasEvent, from: number, to: number) => e.start.year <= to && e.end.year >= from;

export function inBounds([lng, lat]: [number, number], b: Bounds): boolean {
  if (lat < b.south || lat > b.north) return false;
  return b.west <= b.east ? lng >= b.west && lng <= b.east : lng >= b.west || lng <= b.east; // crosses antimeridian
}

export interface QueryResult {
  events: AtlasEvent[]; // passes every filter
  inRange: number; // overlaps the range, before category/importance/place filters
  threshold: number; // minimum importance applied (1 = none)
}

export function queryEvents(all: AtlasEvent[], places: Record<string, Place>, f: EventFilter): QueryResult {
  const threshold = f.showAll ? 1 : thresholdForWidth(f.to - f.from);
  let inRange = 0;
  const events = all.filter((e) => {
    if (!overlaps(e, f.from, f.to)) return false;
    if (f.includeImported === false && !e.reviewed) return false;
    inRange++;
    if (e.importance < threshold) return false;
    if (f.categories.size && !e.categories.some((c) => f.categories.has(c))) return false;
    if (f.placeId && !e.locations.some((l) => l.place === f.placeId)) return false;
    if (f.bounds) {
      const b = f.bounds;
      if (!e.locations.some((l) => places[l.place] && inBounds(places[l.place].coords, b))) return false;
    }
    return true;
  });
  return { events, inRange, threshold };
}

export type SortKey = 'year' | 'importance';

export function sortEvents(events: AtlasEvent[], key: SortKey): AtlasEvent[] {
  if (key === 'year') return events; // atlas is already sorted by start
  return [...events].sort((a, b) => b.importance - a.importance || a.start.year - b.start.year);
}

/** The name a place had in a given year. */
export function placeName(place: Place, year: number, lang: Lang): string {
  const match =
    place.names.find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity)) ??
    // Between two named periods (or before the first): use the closest one.
    [...place.names].sort((a, b) => dist(a, year) - dist(b, year))[0];
  return (lang === 'en' ? match.en : match['zh-TW']) || match['zh-TW'];
}

function dist(n: { from?: number; to?: number }, year: number): number {
  if (n.from !== undefined && year < n.from) return n.from - year;
  if (n.to !== undefined && year > n.to) return year - n.to;
  return 0;
}

/** Event counts per bucket for the timeline histogram, by start year. */
export function histogram(events: AtlasEvent[], buckets: number, posOf: (year: number) => number): number[] {
  const counts = new Array<number>(buckets).fill(0);
  for (const e of events) {
    const i = Math.min(buckets - 1, Math.floor(posOf(e.start.year) * buckets));
    counts[i] += e.importance; // weight by importance so major events stand out
  }
  return counts;
}
