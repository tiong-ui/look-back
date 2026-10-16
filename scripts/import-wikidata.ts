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
//   data/imported/events.yaml   events, marked `reviewed: false`
//   data/imported/places.yaml   their places
//
// Needs network access to query.wikidata.org, so it runs in
// .github/workflows/import.yml rather than locally in restricted sandboxes.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import type { Category } from '../src/lib/categories';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://query.wikidata.org/sparql';
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
/** Taiwan and Penghu, Kinmen, Matsu. */
export const TAIWAN_AREAS = [
  { west: 119.3, east: 122.1, south: 21.85, north: 25.35 },
  { west: 118.24, east: 118.5, south: 24.35, north: 24.55 },
  { west: 119.88, east: 120.55, south: 25.9, north: 26.4 },
];
export const isTaiwan = (c: [number, number]) => TAIWAN_AREAS.some((b) => inBox(c, b));

const REGIONS: [string, { west: number; east: number; south: number; north: number }][] = [
  ['korea', { west: 124, east: 131, south: 33, north: 43 }],
  ['japan', { west: 128.5, east: 150, south: 24, north: 46 }],
  ['southeast-asia', { west: 92, east: 141, south: -11, north: 21.5 }],
  ['south-asia', { west: 60, east: 92, south: 5, north: 37 }],
  ['central-asia', { west: 60, east: 90, south: 37, north: 56 }],
  ['china', { west: 73, east: 135, south: 18, north: 54 }],
];

// ---------------------------------------------------------------------------- SPARQL

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
 * Events of one class located in Taiwan, however few language editions they
 * have. A subquery first narrows the class to items whose own coordinates, or
 * their location's, fall in the Taiwan box; only those few get the label and
 * date lookups, which keeps the query well inside the endpoint's time limit.
 */
export function taiwanQuery(qid: string): string {
  return `${SELECT}
WHERE {
  {
    SELECT DISTINCT ?item WHERE {
      ?item wdt:P31/wdt:P279? wd:${qid} .
      { ?item wdt:P625 ?c } UNION { ?item wdt:P276/wdt:P625 ?c }
      BIND(geof:longitude(?c) AS ?lon)
      BIND(geof:latitude(?c) AS ?lat)
      FILTER(?lon >= ${TAIWAN.west} && ?lon <= ${TAIWAN.east} && ?lat >= ${TAIWAN.south} && ?lat <= ${TAIWAN.north})
    }
  }
  BIND(wd:${qid} AS ?cls)
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${TAIWAN_MIN_SITELINKS})
  ${DETAILS}
}`;
}

type Binding = Record<string, { value: string } | undefined>;

/** The endpoint stops queries at 60 s; give up on a response that takes much longer than that. */
const REQUEST_TIMEOUT_MS = 75_000;

async function runQuery(query: string, attempts = 3): Promise<Binding[]> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
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

const zhLabel = (b: Binding, prefix = '') =>
  val(b, `${prefix}${prefix ? 'Zhtw' : 'zhtw'}`) ?? val(b, `${prefix}${prefix ? 'Zhhant' : 'zhhant'}`) ?? val(b, `${prefix}${prefix ? 'Zh' : 'zh'}`);

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
  reviewed: false;
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

    const descZh = rs.map((r) => val(r, 'descZh')).find(Boolean);
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
      reviewed: false,
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

async function main() {
  const rows: { binding: Binding; cls: EventClass }[] = [];
  for (const [name, cls] of Object.entries(CLASSES)) {
    const bindings = await runQuery(classQuery(cls.qid, cls.minSitelinks));
    console.log(`${name.padEnd(24)} ${bindings.length} rows`);
    for (const binding of bindings) rows.push({ binding, cls });
  }
  // Taiwan pass: lower notability floor. A timeout here only loses the extra
  // low-profile Taiwan events of that class, so warn and carry on.
  const skipped: string[] = [];
  for (const [name, cls] of Object.entries(CLASSES)) {
    try {
      const bindings = await runQuery(taiwanQuery(cls.qid), 1); // a query that timed out once will time out again
      console.log(`${`${name} (Taiwan)`.padEnd(24)} ${bindings.length} rows`);
      for (const binding of bindings) rows.push({ binding, cls });
    } catch {
      console.warn(`::warning::Taiwan query for ${name} timed out; skipped`);
      skipped.push(name);
    }
  }
  if (skipped.length) console.warn(`Taiwan queries skipped: ${skipped.join(', ')}`);
  const { events, places } = rowsToEvents(rows, curatedTitles());

  const outDir = join(ROOT, 'data', 'imported');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const header = (what: string) =>
    `# ${what} imported from Wikidata by scripts/import-wikidata.ts on ${new Date().toISOString().slice(0, 10)}.\n` +
    `# Generated file: re-running the import replaces it. To edit an event, move it to data/events/\n` +
    `# (and drop \`reviewed: false\`); curated events are skipped by later imports.\n`;
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
