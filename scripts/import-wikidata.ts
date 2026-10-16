// Imports historical events in Asia from Wikidata into data/imported/.
//
//   npm run import
//
// Wikidata is the structured counterpart of Wikipedia, the main reference in
// data/resources.yaml. The other references (museums, archives) have no
// machine-readable event lists, so they stay curated by hand.
//
// What gets imported: battles, wars, sieges, treaties, rebellions, revolutions,
// massacres, protests, coups, earthquakes, epidemics and other historical
// events that have a date, a location with coordinates in Asia, and enough
// Wikipedia language editions to count as notable (fewer are needed for
// events in Taiwan). Events already curated in data/events/ are skipped.
//
// Output:
//   data/imported/events.yaml   events
//   data/imported/places.yaml   their places
//
// Needs network access to query.wikidata.org, so it runs in
// .github/workflows/import.yml rather than locally in restricted sandboxes.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';
import { parse, stringify } from 'yaml';
import type { Category } from '../src/lib/categories';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const QLEVER_ENDPOINT = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const USER_AGENT = 'LookBack/0.1 (https://github.com/tiong-ui/look-back) event importer';

// ---------------------------------------------------------------------------- what to fetch

interface EventClass {
  qid: string;
  categories: Category[];
  minSitelinks: number; // notability floor outside Taiwan
}

export const CLASSES: Record<string, EventClass> = {
  battle: { qid: 'Q178561', categories: ['war'], minSitelinks: 8 },
  war: { qid: 'Q198', categories: ['war'], minSitelinks: 6 },
  siege: { qid: 'Q188055', categories: ['war'], minSitelinks: 6 },
  invasion: { qid: 'Q467011', categories: ['war'], minSitelinks: 6 },
  treaty: { qid: 'Q131569', categories: ['diplomacy'], minSitelinks: 6 },
  rebellion: { qid: 'Q124734', categories: ['war', 'politics'], minSitelinks: 5 },
  revolution: { qid: 'Q10931', categories: ['politics'], minSitelinks: 5 },
  coup: { qid: 'Q45382', categories: ['politics'], minSitelinks: 6 },
  massacre: { qid: 'Q3199915', categories: ['war', 'democracy'], minSitelinks: 5 },
  protest: { qid: 'Q273120', categories: ['democracy'], minSitelinks: 5 },
  earthquake: { qid: 'Q7944', categories: ['disaster'], minSitelinks: 6 },
  epidemic: { qid: 'Q44512', categories: ['disaster'], minSitelinks: 6 },
  election: { qid: 'Q40231', categories: ['democracy'], minSitelinks: 15 },
  historicalEvent: { qid: 'Q13418847', categories: ['politics'], minSitelinks: 6 },
};

/** Events in Taiwan need far fewer language editions to be included. */
const TAIWAN_MIN_SITELINKS = 2;

/** Asia, roughly: South, Southeast, East and Central Asia plus the western Pacific rim. */
export const ASIA = { west: 60, east: 155, south: -11, north: 56 };
/** Search box for the Taiwan query; it also catches parts of the Fujian coast, so results are re-checked with TAIWAN_AREAS. */
export const TAIWAN = { west: 118, east: 122.6, south: 21.7, north: 26.5 };
/** Taiwan and Penghu, Kinmen, Matsu — kept clear of the Fujian coast. */
export const TAIWAN_AREAS = [
  { west: 119.9, east: 122.1, south: 21.85, north: 25.35 },
  { west: 119.3, east: 119.75, south: 23.15, north: 23.8 },
  { west: 118.24, east: 118.5, south: 24.35, north: 24.55 },
  { west: 119.88, east: 120.55, south: 25.9, north: 26.4 },
];
export const isTaiwan = (c: [number, number]) => TAIWAN_AREAS.some((b) => inBox(c, b));

const REGIONS: [string, { west: number; east: number; south: number; north: number }][] = [
  ['japan', { west: 122.9, east: 131.5, south: 24, north: 31 }], // Ryukyu Islands
  ['korea', { west: 124, east: 131, south: 33, north: 43 }],
  ['japan', { west: 128.5, east: 150, south: 24, north: 46 }],
  ['southeast-asia', { west: 92, east: 141, south: -11, north: 21.5 }],
  ['south-asia', { west: 60, east: 92, south: 5, north: 37 }],
  ['central-asia', { west: 60, east: 90, south: 37, north: 56 }],
  ['china', { west: 73, east: 135, south: 18, north: 54 }],
];

// ---------------------------------------------------------------------------- SPARQL

/** Countries, states, continents and regions: too broad to place an event on the map. */
const BROAD_PLACES = ['Q6256', 'Q3624078', 'Q3024240', 'Q5107', 'Q7275', 'Q1620908', 'Q82794'].map((q) => `wd:${q}`).join(' ');

const SELECT = `SELECT ?item ?cls ?sitelinks ?date ?datePrec ?start ?startPrec ?end ?coord ?loc ?locCoord
       ?zhtw ?zhhant ?zh ?en ?locZhtw ?locZhhant ?locZh ?locEn ?descZh ?descEn ?enwiki ?zhwiki ?partOf`;

/** Dates, places, labels and Wikipedia titles for a bound ?item. */
const DETAILS = `
  OPTIONAL { ?item p:P585/psv:P585 [ wikibase:timeValue ?date ; wikibase:timePrecision ?datePrec ] }
  OPTIONAL { ?item p:P580/psv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec ] }
  FILTER(BOUND(?date) || BOUND(?start))
  OPTIONAL { ?item wdt:P582 ?end }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P276 ?loc . ?loc wdt:P625 ?locCoord .
    # A country or region as "location" has one representative point (the ROC's is in Taiwan), so skip those.
    FILTER NOT EXISTS { ?loc wdt:P31 ?broad . VALUES ?broad { ${BROAD_PLACES} } }
    OPTIONAL { ?loc rdfs:label ?locZhtw FILTER(LANG(?locZhtw) = "zh-tw") }
    OPTIONAL { ?loc rdfs:label ?locZhhant FILTER(LANG(?locZhhant) = "zh-hant") }
    OPTIONAL { ?loc rdfs:label ?locZh FILTER(LANG(?locZh) = "zh") }
    OPTIONAL { ?loc rdfs:label ?locEn FILTER(LANG(?locEn) = "en") }
  }
  FILTER(BOUND(?coord) || BOUND(?locCoord))
  OPTIONAL { ?item rdfs:label ?zhtw FILTER(LANG(?zhtw) = "zh-tw") }
  OPTIONAL { ?item rdfs:label ?zhhant FILTER(LANG(?zhhant) = "zh-hant") }
  OPTIONAL { ?item rdfs:label ?zh FILTER(LANG(?zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item schema:description ?descZh FILTER(LANG(?descZh) = "zh-tw" || LANG(?descZh) = "zh-hant" || LANG(?descZh) = "zh") }
  OPTIONAL { ?item schema:description ?descEn FILTER(LANG(?descEn) = "en") }
  OPTIONAL { ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enwiki }
  OPTIONAL { ?z schema:about ?item ; schema:isPartOf <https://zh.wikipedia.org/> ; schema:name ?zhwiki }
  OPTIONAL { ?item wdt:P361 ?partOf }`;

/** Notable events of one class anywhere; Asia is filtered afterwards. One class per query keeps each inside the 60 s limit. */
export function classQuery(qid: string, minSitelinks: number): string {
  return `${SELECT}
WHERE {
  BIND(wd:${qid} AS ?cls)
  ?item wdt:P31/wdt:P279? ?cls ;
        wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  ${DETAILS}
}`;
}

/**
 * Taiwan pass, step 1: find events of one class located in Taiwan, however few
 * language editions they have. Scanning a whole class and filtering by
 * coordinates is too heavy for query.wikidata.org (it times out), so this runs
 * on QLever, a fast public SPARQL engine over the same Wikidata data.
 */
export function taiwanDiscoveryQuery(qid: string): string {
  return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?item WHERE {
  ?item wdt:P31/wdt:P279? wd:${qid} .
  { ?item wdt:P625 ?c } UNION { ?item wdt:P276 ?l . ?l wdt:P625 ?c }
  BIND(geof:longitude(?c) AS ?lon)
  BIND(geof:latitude(?c) AS ?lat)
  FILTER(?lon >= ${TAIWAN.west} && ?lon <= ${TAIWAN.east} && ?lat >= ${TAIWAN.south} && ?lat <= ${TAIWAN.north})
}`;
}

/** Taiwan pass, step 2: full details of known items, from query.wikidata.org (cheap: no scan). */
export function detailsQuery(qid: string, items: string[]): string {
  return `${SELECT}
WHERE {
  VALUES ?item { ${items.map((q) => `wd:${q}`).join(' ')} }
  BIND(wd:${qid} AS ?cls)
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${TAIWAN_MIN_SITELINKS})
  ${DETAILS}
}`;
}

type Binding = Record<string, { value: string } | undefined>;

/** The endpoint stops queries at 60 s; give up on a response that takes much longer than that. */
const REQUEST_TIMEOUT_MS = 75_000;

async function runQuery(query: string, attempts = 3, endpoint = ENDPOINT): Promise<Binding[]> {
  let throttled = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 1000)); // be gentle with the shared endpoint
        return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
      }
      if (res.status === 429 && throttled++ < 3) {
        // Rate limited: wait as asked and try again without using up an attempt.
        const wait = Number(res.headers.get('retry-after')) || 30;
        console.warn(`  rate limited, waiting ${wait} s…`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        attempt--;
        continue;
      }
      console.warn(`  query failed (HTTP ${res.status})${attempt + 1 < attempts ? ', retrying…' : ''}`);
    } catch (err) {
      console.warn(`  query failed (${(err as Error).name}: ${(err as Error).message})${attempt + 1 < attempts ? ', retrying…' : ''}`);
    }
    if (attempt + 1 < attempts) await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
  }
  throw new Error('Wikidata query failed repeatedly');
}

// ---------------------------------------------------------------------------- rows → events

interface Box {
  west: number;
  east: number;
  south: number;
  north: number;
}
const inBox = ([lng, lat]: [number, number], b: Box) => lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;

const qidOf = (uri?: string) => uri?.split('/').pop();
const val = (b: Binding, k: string) => b[k]?.value;

/** "Point(121.5 25.03)" → [121.5, 25.03] */
export function parsePoint(wkt?: string): [number, number] | undefined {
  const m = wkt?.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/**
 * Wikidata's RDF dates are XSD 1.1, where year 0000 is 1 BC — the same
 * astronomical numbering this project uses.
 */
export function parseDate(iso?: string, precision?: string) {
  const m = iso?.match(/^(-?\d+)-(\d\d)-(\d\d)/);
  if (!m) return undefined;
  const prec = Number(precision ?? 9);
  const date: { year: number; month?: number; day?: number } = { year: Number(m[1]) };
  if (prec >= 10) date.month = Number(m[2]);
  if (prec >= 11) date.day = Number(m[3]);
  const precisionName =
    prec >= 11 ? 'day' : prec === 10 ? 'month' : prec === 9 ? 'year' : prec === 8 ? 'decade' : prec === 7 ? 'century' : 'millennium';
  return { date, precision: precisionName as 'day' | 'month' | 'year' | 'decade' | 'century' | 'millennium' };
}

/** Wikidata's generic "zh" labels are often Simplified; convert them to Taiwan Traditional usage. */
export const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' });

const zhLabel = (b: Binding, prefix = '') => {
  const k = (name: string) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  const traditional = val(b, k('zhtw')) ?? val(b, k('zhhant'));
  if (traditional) return traditional;
  const generic = val(b, k('zh'));
  return generic ? toTraditional(generic) : undefined;
};

export interface ImportedEvent {
  id: string;
  title: { 'zh-TW': string; en?: string };
  summary: { 'zh-TW': string; en?: string };
  start: { year: number; month?: number; day?: number };
  end?: { year: number; month?: number; day?: number };
  precision: string;
  approximate?: boolean;
  categories: Category[];
  regions: string[];
  importance: number;
  wikidata: string;
  locations: { place: string; role: 'primary' | 'secondary' }[];
  relations?: { event: string; type: 'part_of' }[];
  wikipedia?: { en?: string; zh?: string };
}

export interface ImportedPlace {
  id: string;
  coords: [number, number];
  names: { 'zh-TW': string; en?: string }[];
}

export interface Curated {
  wikipediaTitles: Set<string>; // normalised titles of curated events
}

const normTitle = (t: string) => t.replace(/_/g, ' ').trim().toLowerCase();

export function importanceFromSitelinks(sitelinks: number, taiwan: boolean): number {
  const base = sitelinks >= 80 ? 5 : sitelinks >= 40 ? 4 : sitelinks >= 20 ? 3 : sitelinks >= 10 ? 2 : 1;
  return Math.min(5, base + (taiwan ? 1 : 0));
}

function regionsFor(coords: [number, number][]): string[] {
  const out = new Set<string>();
  for (const c of coords) {
    if (isTaiwan(c)) {
      out.add('taiwan');
      continue;
    }
    const r = REGIONS.find(([, box]) => inBox(c, box));
    if (r) out.add(r[0]);
  }
  return out.size ? [...out] : ['asia'];
}

/** Turn SPARQL rows (one class at a time, or all together) into events and places. */
export function rowsToEvents(
  rows: { binding: Binding; cls: EventClass }[],
  curated: Curated,
): { events: ImportedEvent[]; places: ImportedPlace[] } {
  // Group rows by item; the query returns one row per date × location × label combination.
  const items = new Map<string, { rows: Binding[]; classes: EventClass[] }>();
  for (const { binding, cls } of rows) {
    const qid = qidOf(val(binding, 'item'));
    if (!qid) continue;
    if (!items.has(qid)) items.set(qid, { rows: [], classes: [] });
    const it = items.get(qid)!;
    it.rows.push(binding);
    if (!it.classes.includes(cls)) it.classes.push(cls);
  }

  const places = new Map<string, ImportedPlace>();
  const events: ImportedEvent[] = [];

  for (const [qid, { rows: rs, classes }] of items) {
    const first = rs[0];
    const sitelinks = Number(val(first, 'sitelinks') ?? 0);
    const enwiki = rs.map((r) => val(r, 'enwiki')).find(Boolean);
    const zhwiki = rs.map((r) => val(r, 'zhwiki')).find(Boolean);
    if ((enwiki && curated.wikipediaTitles.has(normTitle(enwiki))) || (zhwiki && curated.wikipediaTitles.has(normTitle(zhwiki)))) continue;

    // Dates: prefer "point in time", else "start time"; take the earliest.
    const dates = rs
      .map((r) => parseDate(val(r, 'date'), val(r, 'datePrec')) ?? parseDate(val(r, 'start'), val(r, 'startPrec')))
      .filter((d) => d !== undefined)
      .sort((a, b) => a.date.year - b.date.year);
    if (!dates.length) continue;
    const { date: start, precision } = dates[0];
    const endYears = rs.map((r) => parseDate(val(r, 'end'), '11')?.date).filter((d) => d !== undefined).sort((a, b) => b.year - a.year);
    const end = endYears[0] && endYears[0].year >= start.year ? endYears[0] : undefined;
    if (start.year > 2026 || start.year < -29999) continue;

    // Places: the item's own coordinates, then its "location" items.
    const locs: { id: string; coords: [number, number]; names: ImportedPlace['names'] }[] = [];
    const titleZh = zhLabel(first) ?? val(first, 'en') ?? qid;
    const titleEn = val(first, 'en');
    const own = parsePoint(rs.map((r) => val(r, 'coord')).find(Boolean));
    for (const r of rs) {
      const locId = qidOf(val(r, 'loc'));
      const c = parsePoint(val(r, 'locCoord'));
      if (!locId || !c || locs.some((l) => l.id === `wd-${locId.toLowerCase()}`)) continue;
      const zh = zhLabel(r, 'loc') ?? val(r, 'locEn');
      if (!zh) continue;
      locs.push({ id: `wd-${locId.toLowerCase()}`, coords: c, names: [{ 'zh-TW': zh, en: val(r, 'locEn') }] });
    }
    if (own && !locs.some((l) => l.coords[0] === own[0] && l.coords[1] === own[1])) {
      locs.unshift({ id: `wd-${qid.toLowerCase()}-site`, coords: own, names: [{ 'zh-TW': titleZh, en: titleEn }] });
    }
    const inAsia = locs.filter((l) => inBox(l.coords, ASIA));
    if (!inAsia.length) continue;

    const taiwan = inAsia.some((l) => isTaiwan(l.coords));
    const floor = taiwan ? TAIWAN_MIN_SITELINKS : Math.min(...classes.map((c) => c.minSitelinks));
    if (sitelinks < floor) continue;

    for (const l of inAsia.slice(0, 4)) if (!places.has(l.id)) places.set(l.id, { id: l.id, coords: l.coords, names: l.names });

    const descZhRaw = rs.map((r) => val(r, 'descZh')).find(Boolean);
    const descZh = descZhRaw ? toTraditional(descZhRaw) : undefined;
    const descEn = rs.map((r) => val(r, 'descEn')).find(Boolean);
    const partOf = [...new Set(rs.map((r) => qidOf(val(r, 'partOf'))).filter((p): p is string => !!p))];

    events.push({
      id: `wd-${qid.toLowerCase()}`,
      title: { 'zh-TW': titleZh, ...(titleEn ? { en: titleEn } : {}) },
      summary: {
        'zh-TW': descZh ?? descEn ?? titleZh,
        ...(descEn ? { en: descEn } : {}),
      },
      start,
      ...(end ? { end } : {}),
      precision,
      ...(['decade', 'century', 'millennium'].includes(precision) ? { approximate: true } : {}),
      categories: [...new Set(classes.flatMap((c) => c.categories))],
      regions: regionsFor(inAsia.map((l) => l.coords)),
      importance: importanceFromSitelinks(sitelinks, taiwan),
      wikidata: qid,
      locations: inAsia.slice(0, 4).map((l, i) => ({ place: l.id, role: i === 0 ? 'primary' : 'secondary' })),
      ...(partOf.length ? { relations: partOf.map((p) => ({ event: `wd-${p.toLowerCase()}`, type: 'part_of' as const })) } : {}),
      ...(enwiki || zhwiki ? { wikipedia: { ...(enwiki ? { en: enwiki } : {}), ...(zhwiki ? { zh: zhwiki } : {}) } } : {}),
    });
  }

  // Keep only relations whose target was imported too.
  const ids = new Set(events.map((e) => e.id));
  for (const e of events) {
    if (!e.relations) continue;
    e.relations = e.relations.filter((r) => ids.has(r.event) && r.event !== e.id);
    if (!e.relations.length) delete e.relations;
  }

  events.sort((a, b) => a.start.year - b.start.year || a.id.localeCompare(b.id));
  return { events, places: [...places.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

// ---------------------------------------------------------------------------- main

function curatedTitles(): Curated {
  const dir = join(ROOT, 'data', 'events');
  const titles = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    for (const e of (parse(readFileSync(join(dir, f), 'utf8')) as { wikipedia?: { en?: string; zh?: string } }[]) ?? []) {
      if (e.wikipedia?.en) titles.add(normTitle(e.wikipedia.en));
      if (e.wikipedia?.zh) titles.add(normTitle(e.wikipedia.zh));
    }
  }
  return { wikipediaTitles: titles };
}

/**
 * When some queries failed, keep the previous import's events that this run
 * could not re-fetch (and their places), so a busy endpoint never deletes data.
 */
export function carryForward(
  fresh: { events: ImportedEvent[]; places: ImportedPlace[] },
  previous: { events: ImportedEvent[]; places: ImportedPlace[] },
  curated: Curated,
): { events: ImportedEvent[]; places: ImportedPlace[]; carried: number } {
  const have = new Set(fresh.events.map((e) => e.id));
  const isCurated = (e: ImportedEvent) =>
    [e.wikipedia?.en, e.wikipedia?.zh].some((t) => t && curated.wikipediaTitles.has(normTitle(t)));
  const carriedEvents = previous.events.filter((e) => !have.has(e.id) && !isCurated(e));
  const placeIds = new Set(fresh.places.map((p) => p.id));
  const prevPlaces = new Map(previous.places.map((p) => [p.id, p]));
  const extraPlaces: ImportedPlace[] = [];
  for (const e of carriedEvents)
    for (const l of e.locations) {
      const p = prevPlaces.get(l.place);
      if (p && !placeIds.has(p.id)) {
        placeIds.add(p.id);
        extraPlaces.push(p);
      }
    }
  return {
    events: [...fresh.events, ...carriedEvents].sort((a, b) => a.start.year - b.start.year || a.id.localeCompare(b.id)),
    places: [...fresh.places, ...extraPlaces].sort((a, b) => a.id.localeCompare(b.id)),
    carried: carriedEvents.length,
  };
}

async function main() {
  const rows: { binding: Binding; cls: EventClass }[] = [];
  // General pass. The public endpoint is often overloaded; one class failing
  // shouldn't sink the run, so failures are collected and handled below.
  const failed: string[] = [];
  for (const [name, cls] of Object.entries(CLASSES)) {
    try {
      const bindings = await runQuery(classQuery(cls.qid, cls.minSitelinks), 4);
      console.log(`${name.padEnd(24)} ${bindings.length} rows`);
      for (const binding of bindings) rows.push({ binding, cls });
    } catch {
      console.warn(`::warning::Query for ${name} failed; keeping that class's events from the previous import`);
      failed.push(name);
    }
  }
  if (failed.length === Object.keys(CLASSES).length) throw new Error('Every Wikidata query failed; is the endpoint down?');
  // Taiwan pass: lower notability floor. A failure here only loses the extra
  // low-profile Taiwan events of that class, so warn and carry on.
  const skipped: string[] = [];
  for (const [name, cls] of Object.entries(CLASSES)) {
    try {
      const found = await runQuery(taiwanDiscoveryQuery(cls.qid), 2, QLEVER_ENDPOINT);
      const qids = [...new Set(found.map((b) => qidOf(val(b, 'item'))).filter((q): q is string => !!q))];
      let count = 0;
      for (let i = 0; i < qids.length; i += 150) {
        const bindings = await runQuery(detailsQuery(cls.qid, qids.slice(i, i + 150)));
        count += bindings.length;
        for (const binding of bindings) rows.push({ binding, cls });
      }
      console.log(`${`${name} (Taiwan)`.padEnd(24)} ${qids.length} items, ${count} rows`);
    } catch {
      console.warn(`::warning::Taiwan query for ${name} failed; skipped`);
      skipped.push(name);
    }
  }
  if (skipped.length) console.warn(`Taiwan queries skipped: ${skipped.join(', ')}`);
  const curated = curatedTitles();
  let { events, places } = rowsToEvents(rows, curated);

  const outDir = join(ROOT, 'data', 'imported');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const prevEventsFile = join(outDir, 'events.yaml');
  const prevPlacesFile = join(outDir, 'places.yaml');
  if ((failed.length || skipped.length) && existsSync(prevEventsFile) && existsSync(prevPlacesFile)) {
    const previous = {
      events: (parse(readFileSync(prevEventsFile, 'utf8')) as ImportedEvent[]) ?? [],
      places: (parse(readFileSync(prevPlacesFile, 'utf8')) as ImportedPlace[]) ?? [],
    };
    const merged = carryForward({ events, places }, previous, curated);
    ({ events, places } = merged);
    console.log(`Kept ${merged.carried} events from the previous import that this run could not re-fetch`);
  }
  if (failed.length) console.warn(`General queries failed: ${failed.join(', ')}`);
  const header = (what: string) =>
    `# ${what} imported from Wikidata by scripts/import-wikidata.ts on ${new Date().toISOString().slice(0, 10)}.\n` +
    `# Generated file: re-running the import replaces it. To edit an event, move it to data/events/\n` +
    `# to rewrite it there; curated events are skipped by later imports.\n`;
  writeFileSync(join(outDir, 'events.yaml'), header('Events') + stringify(events, { lineWidth: 0 }));
  writeFileSync(join(outDir, 'places.yaml'), header('Places') + stringify(places, { lineWidth: 0, collectionStyle: 'any' }));
  const byRegion = events.reduce<Record<string, number>>((acc, e) => {
    for (const r of e.regions) acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Imported ${events.length} events and ${places.length} places →  data/imported/`);
  console.log('By region:', byRegion);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
