// Builds public/data/atlas.json from the YAML in data/ (one file per record,
// edited by hand, in the CMS at /admin, or by the Wikidata importer).
// Validates everything first; any error stops the build with a clear message.
//
//   npm run data

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { CATEGORY_IDS, type Category } from '../src/lib/categories';
import { clean, readRecords } from './data-utils';
import { clampImportance, scoreToImportance, wikiScore, type WikiSignals } from '../src/lib/importance';
import type { Atlas, AtlasEvent, RelationType, SourceLink } from '../src/lib/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

// ---------------------------------------------------------------------------- schemas

const localized = z.object({ 'zh-TW': z.string().min(1), en: z.string().optional() }).strict();
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase kebab-case');
const year = z.number().int();
const datePoint = z.union([
  year.transform((y) => ({ year: y })),
  z.object({ year, month: z.number().int().min(1).max(12).optional(), day: z.number().int().min(1).max(31).optional() }).strict(),
]);
const role = z.enum(['primary', 'secondary', 'origin', 'destination', 'area']);
const relationType = z.enum(['causes', 'caused_by', 'part_of', 'has_part', 'precedes', 'follows', 'related']);

const eventSchema = z
  .object({
    id,
    title: localized,
    altNames: z.array(localized).optional(),
    summary: localized,
    start: datePoint,
    end: datePoint.optional(),
    precision: z.enum(['day', 'month', 'year', 'decade', 'century', 'millennium']).default('year'),
    approximate: z.boolean().default(false),
    categories: z.array(z.enum(CATEGORY_IDS as [Category, ...Category[]])).min(1),
    regions: z.array(z.string()).min(1),
    importance: z.number().int().min(1).max(5).optional(),
    importanceBoost: z.number().int().min(-2).max(2).optional(),
    importanceLocked: z.boolean().optional(),
    wikidata: z.string().regex(/^Q\d+$/).optional(),
    importHash: z.string().optional(), // set by the Wikidata importer; see scripts/data-utils.ts
    locations: z.array(z.object({ place: id, role }).strict()).min(1),
    relations: z.array(z.object({ event: id, type: relationType }).strict()).optional(),
    perspectives: z.array(z.object({ view: z.string(), text: localized }).strict()).optional(),
    wikipedia: z.object({ en: z.string().optional(), zh: z.string().optional() }).strict().optional(),
    sources: z
      .array(
        z
          .object({
            resource: id.optional(),
            url: z.string().url().optional(),
            title: localized.optional(),
            page: z.union([z.string(), z.number()]).transform(String).optional(), // e.g. "p.215" for a book
          })
          .strict()
          .refine((s) => s.resource || s.url, 'a source needs a `resource` or a `url`'),
      )
      .optional(),
  })
  .strict();

const placeSchema = z
  .object({
    id,
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
    names: z.array(z.object({ 'zh-TW': z.string(), en: z.string().optional(), from: year.optional(), to: year.optional() }).strict()).min(1),
    modern: localized.optional(),
  })
  .strict()
  .transform(({ lng, lat, ...p }) => ({ ...p, coords: [lng, lat] as [number, number] }));

const eraSchema = z.object({ id, group: z.string(), name: localized, from: year, to: year }).strict();

const resourceSchema = z
  .object({
    id,
    name: localized,
    url: z.string().url().optional(),
    type: z.string(),
    lang: z.array(z.string()),
    description: localized.optional(),
  })
  .strict();

const configSchema = z
  .object({
    viewpoints: z.record(localized),
    regionBoost: z.record(z.number().int()),
    eraGroups: z.record(localized),
    resourceTypes: z.record(localized),
  })
  .strict();

const importanceFileSchema = z.object({
  generatedAt: z.string(),
  events: z.record(z.object({ sitelinks: z.number(), viewsEn: z.number(), viewsZh: z.number() }).passthrough()),
});

// ---------------------------------------------------------------------------- helpers

const INVERSE: Record<RelationType, RelationType> = {
  causes: 'caused_by',
  caused_by: 'causes',
  part_of: 'has_part',
  has_part: 'part_of',
  precedes: 'follows',
  follows: 'precedes',
  related: 'related',
};

function load(file: string): unknown {
  return parse(readFileSync(file, 'utf8'));
}

/** Validate every record file in data/<folder>/; each file must be named after its id. */
function loadFolder<T extends { id: string }>(
  dataDir: string,
  folder: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  errors: string[],
): T[] {
  const out: T[] = [];
  for (const { file, record } of readRecords(join(dataDir, folder))) {
    const r = check(schema, clean(record), `${folder}/${file}`, errors);
    if (!r) continue;
    if (file.replace(/\.ya?ml$/, '') !== r.id) errors.push(`${folder}/${file}: file name should be "${r.id}.yaml" to match its id`);
    out.push(r);
  }
  return out;
}

function check<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, where: string, errors: string[]): T | undefined {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  for (const issue of r.error.issues) errors.push(`${where}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
  return undefined;
}

const wikiUrl = (lang: 'en' | 'zh', title: string) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// ---------------------------------------------------------------------------- build

export function buildAtlas(dataDir = DATA): { atlas: Atlas; errors: string[] } {
  const errors: string[] = [];

  const config = check(configSchema, load(join(dataDir, 'config.yaml')), 'config.yaml', errors);
  const places = loadFolder(dataDir, 'places', placeSchema, errors);
  const eras = loadFolder(dataDir, 'eras', eraSchema, errors);
  const resources = loadFolder(dataDir, 'resources', resourceSchema, errors);
  const rawEvents = loadFolder(dataDir, 'events', eventSchema, errors);

  const importancePath = join(dataDir, 'importance.json');
  const computed = existsSync(importancePath)
    ? check(importanceFileSchema, JSON.parse(readFileSync(importancePath, 'utf8')), 'importance.json', errors)
    : undefined;

  // Uniqueness
  const dupes = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`duplicate ${what} id: ${i}`);
      seen.add(i);
    }
    return seen;
  };
  const placeIds = dupes(places.map((p) => p.id), 'place');
  const eventIds = dupes(rawEvents.map((e) => e.id), 'event');
  const resourceIds = dupes(resources.map((r) => r.id), 'resource');
  dupes(eras.map((e) => e.id), 'era');

  // Referential integrity
  for (const e of rawEvents) {
    for (const l of e.locations) if (!placeIds.has(l.place)) errors.push(`event ${e.id}: unknown place "${l.place}"`);
    for (const r of e.relations ?? []) {
      if (!eventIds.has(r.event)) errors.push(`event ${e.id}: unknown related event "${r.event}"`);
      if (r.event === e.id) errors.push(`event ${e.id}: relates to itself`);
    }
    for (const s of e.sources ?? []) if (s.resource && !resourceIds.has(s.resource)) errors.push(`event ${e.id}: unknown resource "${s.resource}"`);
    for (const p of e.perspectives ?? []) if (config && !config.viewpoints[p.view]) errors.push(`event ${e.id}: unknown viewpoint "${p.view}"`);
    const end = e.end ?? e.start;
    if (end.year < e.start.year) errors.push(`event ${e.id}: ends before it starts`);
  }
  for (const r of resources) if (config && !config.resourceTypes[r.type]) errors.push(`resource ${r.id}: unknown type "${r.type}"`);
  for (const era of eras) if (config && !config.eraGroups[era.group]) errors.push(`era ${era.id}: unknown group "${era.group}"`);

  // Relations: add the inverse of every relation so both events show it.
  const relations = new Map<string, Map<string, RelationType>>();
  const addRel = (from: string, to: string, type: RelationType) => {
    if (!relations.has(from)) relations.set(from, new Map());
    const m = relations.get(from)!;
    if (!m.has(to)) m.set(to, type);
  };
  for (const e of rawEvents) for (const r of e.relations ?? []) addRel(e.id, r.event, r.type);
  for (const e of rawEvents) for (const r of e.relations ?? []) addRel(r.event, e.id, INVERSE[r.type]);

  const resourceById = new Map(resources.map((r) => [r.id, r]));

  const events: AtlasEvent[] = rawEvents.map((e) => {
    const signals = computed?.events[e.id] as WikiSignals | undefined;
    const regionBoost = Math.max(0, ...e.regions.map((r) => config?.regionBoost[r] ?? 0));
    let importance: number;
    let importanceSource: AtlasEvent['importanceSource'];
    if (signals && !e.importanceLocked) {
      importance = clampImportance(scoreToImportance(wikiScore(signals)) + regionBoost + (e.importanceBoost ?? 0));
      importanceSource = 'computed';
    } else {
      importance = e.importance ?? 3;
      importanceSource = 'editor';
    }

    const sources: SourceLink[] = [];
    if (e.wikipedia?.zh) sources.push({ url: wikiUrl('zh', e.wikipedia.zh), title: { 'zh-TW': `維基百科：${e.wikipedia.zh}`, en: `Wikipedia (zh): ${e.wikipedia.zh}` }, resource: 'wikipedia-zh' });
    if (e.wikipedia?.en) sources.push({ url: wikiUrl('en', e.wikipedia.en), title: { 'zh-TW': `英文維基百科：${e.wikipedia.en}`, en: `Wikipedia: ${e.wikipedia.en}` }, resource: 'wikipedia-en' });
    if (e.wikidata) sources.push({ url: `https://www.wikidata.org/wiki/${e.wikidata}`, title: { 'zh-TW': `維基數據：${e.wikidata}`, en: `Wikidata: ${e.wikidata}` }, resource: 'wikidata' });
    for (const s of e.sources ?? []) {
      const res = s.resource ? resourceById.get(s.resource) : undefined;
      const url = s.url ?? res?.url;
      if (!url) {
        // A book without a link: cite it by name.
        if (res) sources.push({ url: '', title: s.title ?? res.name, resource: res.id, ...(s.page ? { page: s.page } : {}) });
        continue;
      }
      sources.push({ url, title: s.title ?? res?.name ?? { 'zh-TW': url }, resource: s.resource, ...(s.page ? { page: s.page } : {}) });
    }

    return {
      id: e.id,
      title: e.title,
      altNames: e.altNames,
      summary: e.summary,
      start: e.start,
      end: e.end ?? e.start,
      precision: e.precision,
      approximate: e.approximate,
      categories: e.categories,
      regions: e.regions,
      importance,
      importanceSource,
      locations: e.locations,
      relations: [...(relations.get(e.id) ?? new Map()).entries()].map(([event, type]) => ({ event, type })),
      perspectives: e.perspectives ?? [],
      sources,
    };
  });

  events.sort((a, b) => a.start.year - b.start.year || (a.start.month ?? 0) - (b.start.month ?? 0) || a.id.localeCompare(b.id));

  const atlas: Atlas = {
    generatedAt: computed?.generatedAt ?? '',
    events,
    places: Object.fromEntries(places.map((p) => [p.id, p])),
    eras,
    eraGroups: config?.eraGroups ?? {},
    resources,
    resourceTypes: config?.resourceTypes ?? {},
    viewpoints: config?.viewpoints ?? {},
  };
  return { atlas, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { atlas, errors } = buildAtlas();
  if (errors.length) {
    console.error(`✖ Data has ${errors.length} problem(s):\n  ` + errors.join('\n  '));
    process.exit(1);
  }
  const out = join(ROOT, 'public', 'data', 'atlas.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(atlas));
  const computed = atlas.events.filter((e) => e.importanceSource === 'computed').length;
  const imported = atlas.events.filter((e) => e.id.startsWith('wd-')).length;
  console.log(
    `✔ ${atlas.events.length} events (${imported} from Wikidata), ${Object.keys(atlas.places).length} places, ${atlas.eras.length} eras, ` +
      `${atlas.resources.length} resources → public/data/atlas.json (importance: ${computed} computed, ${atlas.events.length - computed} editor)`,
  );
}
