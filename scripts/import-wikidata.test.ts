import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from './build-data';
import { contentHash, writeRecord } from './data-utils';
import { CLASSES, detailsQuery, existingData, mergeImport, importanceFromSitelinks, parseDate, parsePoint, rowsToEvents, taiwanDiscoveryQuery } from './import-wikidata';

const v = (value: string) => ({ value });
const WD = 'http://www.wikidata.org/entity/';

// SPARQL rows in the shape query.wikidata.org returns.
const rows = [
  // A battle in Taiwan with few language editions: kept thanks to the Taiwan floor.
  {
    cls: CLASSES.battle,
    binding: {
      item: v(`${WD}Q100`), sitelinks: v('3'), start: v('1884-10-08T00:00:00Z'), startPrec: v('11'),
      loc: v(`${WD}Q200`), locCoord: v('Point(121.44 25.17)'), locZhtw: v('滬尾'), locEn: v('Hobe'),
      zhtw: v('滬尾之役'), en: v('Battle of Tamsui (test)'), descZh: v('清法戰爭中的戰役'), descEn: v('battle of the Sino-French War'),
      enwiki: v('Battle of Tamsui (test)'), partOf: v(`${WD}Q101`),
    },
  },
  // Same item, second location row: grouped into one event.
  {
    cls: CLASSES.battle,
    binding: {
      item: v(`${WD}Q100`), sitelinks: v('3'), start: v('1884-10-08T00:00:00Z'), startPrec: v('11'),
      loc: v(`${WD}Q201`), locCoord: v('Point(121.76 25.15)'), locZh: v('基隆'), locEn: v('Keelung'),
      zhtw: v('滬尾之役'), en: v('Battle of Tamsui (test)'),
    },
  },
  // The war it belongs to.
  {
    cls: CLASSES.war,
    binding: {
      item: v(`${WD}Q101`), sitelinks: v('45'), start: v('1884-08-01T00:00:00Z'), startPrec: v('10'), end: v('1885-04-04T00:00:00Z'),
      coord: v('Point(110 20)'), zh: v('清法戰爭（測試）'), en: v('Sino-French War (test)'),
    },
  },
  // Too few language editions outside Taiwan: dropped.
  { cls: CLASSES.battle, binding: { item: v(`${WD}Q102`), sitelinks: v('3'), date: v('1600-01-01T00:00:00Z'), datePrec: v('9'), coord: v('Point(135 35)'), en: v('Minor skirmish') } },
  // Outside Asia: dropped.
  { cls: CLASSES.battle, binding: { item: v(`${WD}Q103`), sitelinks: v('90'), date: v('1815-06-18T00:00:00Z'), datePrec: v('11'), coord: v('Point(4.4 50.7)'), en: v('Waterloo') } },
  // Already curated (matched by Wikipedia title): skipped.
  { cls: CLASSES.massacre, binding: { item: v(`${WD}Q104`), sitelinks: v('40'), date: v('1947-02-27T00:00:00Z'), datePrec: v('11'), coord: v('Point(121.5 25.05)'), en: v('228'), enwiki: v('February 28 incident') } },
  // Fujian coast near Taiwan (Nanri Island): not Taiwan.
  { cls: CLASSES.battle, binding: { item: v(`${WD}Q106`), sitelinks: v('9'), date: v('1952-10-11T00:00:00Z'), datePrec: v('11'), coord: v('Point(119.5 25.2)'), zh: v('南日岛战役'), en: v('Battle of Nanri Island (test)') } },
  // Ryukyu Islands: Japan, not China.
  { cls: CLASSES.earthquake, binding: { item: v(`${WD}Q107`), sitelinks: v('8'), date: v('1771-04-24T00:00:00Z'), datePrec: v('11'), coord: v('Point(124.3 24.0)'), zh: v('八重山地震'), en: v('1771 Yaeyama earthquake (test)') } },
  // BC date: Wikidata RDF uses year 0000 = 1 BC, the same as this project.
  { cls: CLASSES.war, binding: { item: v(`${WD}Q105`), sitelinks: v('30'), start: v('-0259-01-01T00:00:00Z'), startPrec: v('9'), coord: v('Point(112.9 35.8)'), zh: v('長平之戰'), en: v('Battle of Changping (test)') } },
];

const curated = { wikipediaTitles: new Set(['february 28 incident']) };

describe('Wikidata import', () => {
  const { events, places } = rowsToEvents(rows, curated);
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));

  it('keeps notable events in Asia and drops the rest', () => {
    expect(Object.keys(byId).sort()).toEqual(['wd-q100', 'wd-q101', 'wd-q105', 'wd-q106', 'wd-q107']);
  });

  it('groups rows into one event with all its places', () => {
    const e = byId['wd-q100'];
    expect(e.title).toEqual({ 'zh-TW': '滬尾之役', en: 'Battle of Tamsui (test)' });
    expect(e.start).toEqual({ year: 1884, month: 10, day: 8 });
    expect(e.precision).toBe('day');
    expect(e.locations).toEqual([
      { place: 'wd-q200', role: 'primary' },
      { place: 'wd-q201', role: 'secondary' },
    ]);
    expect(e.regions).toEqual(['taiwan']);
    expect(e.relations).toEqual([{ event: 'wd-q101', type: 'part_of' }]);
    expect(places.map((p) => p.id)).toContain('wd-q200');
  });

  it('uses the event’s own coordinates when it has no location item', () => {
    expect(byId['wd-q101'].locations).toEqual([{ place: 'wd-q101-site', role: 'primary' }]);
    expect(byId['wd-q101'].end).toEqual({ year: 1885, month: 4, day: 4 });
  });

  it('converts Simplified Chinese labels to Traditional', () => {
    expect(byId['wd-q106'].title['zh-TW']).toBe('南日島戰役');
    expect(byId['wd-q100'].title['zh-TW']).toBe('滬尾之役'); // zh-tw label kept as is
  });

  it('tells Taiwan apart from the Fujian coast, and Ryukyu from China', () => {
    expect(byId['wd-q106'].regions).toEqual(['china']);
    expect(byId['wd-q107'].regions).toEqual(['japan']);
  });

  it('keeps BC years astronomical', () => {
    expect(byId['wd-q105'].start.year).toBe(-259); // 260 BC
  });

  it('produces data the build accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lookback-'));
    cpSync(join(__dirname, '..', 'data'), dir, { recursive: true });
    for (const e of events) writeRecord(join(dir, 'events'), e.id, { ...e, importHash: contentHash(e) });
    for (const { coords, ...p } of places) writeRecord(join(dir, 'places'), p.id, { ...p, lng: coords[0], lat: coords[1] });
    const { atlas, errors } = buildAtlas(dir);
    expect(errors).toEqual([]);
    const e = atlas.events.find((x) => x.id === 'wd-q100')!;
    expect(e.sources.map((s) => s.url)).toContain('https://www.wikidata.org/wiki/Q100');
  });
});

describe('Taiwan queries', () => {
  it('discovers by class and coordinates, with explicit prefixes for QLever', () => {
    const q = taiwanDiscoveryQuery('Q178561');
    expect(q).toContain('PREFIX wdt: <http://www.wikidata.org/prop/direct/>');
    expect(q).toContain('wdt:P31/wdt:P279? wd:Q178561');
    expect(q).toMatch(/FILTER\(\?lon >= 118/);
  });

  it('fetches details for known items only', () => {
    const q = detailsQuery('Q178561', ['Q1', 'Q2']);
    expect(q).toContain('VALUES ?item { wd:Q1 wd:Q2 }');
    expect(q).toContain('BIND(wd:Q178561 AS ?cls)');
    expect(q).toContain('?sitelinks >= 2');
  });
});

describe('helpers', () => {
  it('parses WKT points and dates', () => {
    expect(parsePoint('Point(121.5 25.03)')).toEqual([121.5, 25.03]);
    expect(parseDate('1661-04-30T00:00:00Z', '10')).toEqual({ date: { year: 1661, month: 4 }, precision: 'month' });
    expect(parseDate('1600-01-01T00:00:00Z', '7')?.precision).toBe('century');
  });

  it('scores importance from language editions, with a Taiwan boost', () => {
    expect(importanceFromSitelinks(90, false)).toBe(5);
    expect(importanceFromSitelinks(3, false)).toBe(1);
    expect(importanceFromSitelinks(3, true)).toBe(2);
  });
});

describe('mergeImport', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'lookback-'));
    cpSync(join(__dirname, '..', 'data'), dir, { recursive: true });
    return dir;
  };
  const read = (dir: string, id: string) => parse(readFileSync(join(dir, 'events', `${id}.yaml`), 'utf8'));
  const fresh = (dir: string, id: string, patch: object) => {
    const { importHash: _h, ...e } = read(dir, id);
    return { ...e, ...patch };
  };

  it('refreshes untouched imports, keeps edited ones, adds new ones', () => {
    const dir = setup();
    const id = 'wd-q1064923'; // Battle of Zhuolu, imported
    // Someone edits a different imported event in the CMS.
    const editedId = 'wd-q1002716';
    const edited = read(dir, editedId);
    writeFileSync(join(dir, 'events', `${editedId}.yaml`), stringify({ ...edited, summary: { 'zh-TW': '編輯改寫的摘要' } }));

    const events = [
      fresh(dir, id, { summary: { 'zh-TW': '新的維基數據描述' } }),
      fresh(dir, editedId, { summary: { 'zh-TW': '維基數據的新描述' } }),
      { ...fresh(dir, id, {}), id: 'wd-q999999999', wikidata: 'Q999999999', locations: [{ place: 'wd-q999999999-site', role: 'primary' }] },
    ];
    const places = [{ id: 'wd-q999999999-site', coords: [121, 24] as [number, number], names: [{ 'zh-TW': '新地點' }] }];
    const count = mergeImport(dir, events as never, places);

    expect(count).toMatchObject({ added: 1, refreshed: 1, keptEdited: 1, newPlaces: 1 });
    expect(read(dir, id).summary['zh-TW']).toBe('新的維基數據描述');
    expect(read(dir, editedId).summary['zh-TW']).toBe('編輯改寫的摘要');
    const { atlas, errors } = buildAtlas(dir);
    expect(errors).toEqual([]);
    expect(atlas.events.some((e) => e.id === 'wd-q999999999')).toBe(true);
  });

  it('treats edited, curated and excluded events as off-limits', () => {
    const dir = setup();
    writeFileSync(join(dir, 'excluded.yaml'), 'wikidata:\n  - Q1064923\n');
    const { curated } = existingData(dir);
    expect(curated.qids.has('Q1064923')).toBe(true); // excluded
    expect(curated.wikipediaTitles.has('february 28 incident')).toBe(true); // curated
  });
});
