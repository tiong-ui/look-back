import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from './build-data';
import { CLASSES, importanceFromSitelinks, parseDate, parsePoint, rowsToEvents } from './import-wikidata';

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
  // BC date: Wikidata RDF uses year 0000 = 1 BC, the same as this project.
  { cls: CLASSES.war, binding: { item: v(`${WD}Q105`), sitelinks: v('30'), start: v('-0259-01-01T00:00:00Z'), startPrec: v('9'), coord: v('Point(112.9 35.8)'), zh: v('長平之戰'), en: v('Battle of Changping (test)') } },
];

const curated = { wikipediaTitles: new Set(['february 28 incident']) };

describe('Wikidata import', () => {
  const { events, places } = rowsToEvents(rows, curated);
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));

  it('keeps notable events in Asia and drops the rest', () => {
    expect(Object.keys(byId).sort()).toEqual(['wd-q100', 'wd-q101', 'wd-q105']);
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
    expect(e.reviewed).toBe(false);
    expect(e.relations).toEqual([{ event: 'wd-q101', type: 'part_of' }]);
    expect(places.map((p) => p.id)).toContain('wd-q200');
  });

  it('uses the event’s own coordinates when it has no location item', () => {
    expect(byId['wd-q101'].locations).toEqual([{ place: 'wd-q101-site', role: 'primary' }]);
    expect(byId['wd-q101'].end).toEqual({ year: 1885, month: 4, day: 4 });
  });

  it('keeps BC years astronomical', () => {
    expect(byId['wd-q105'].start.year).toBe(-259); // 260 BC
  });

  it('produces data the build accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lookback-'));
    cpSync(join(__dirname, '..', 'data'), dir, { recursive: true });
    mkdirSync(join(dir, 'imported'), { recursive: true });
    writeFileSync(join(dir, 'imported', 'events.yaml'), stringify(events));
    writeFileSync(join(dir, 'imported', 'places.yaml'), stringify(places));
    const { atlas, errors } = buildAtlas(dir);
    expect(errors).toEqual([]);
    const e = atlas.events.find((x) => x.id === 'wd-q100')!;
    expect(e.reviewed).toBe(false);
    expect(e.sources.map((s) => s.url)).toContain('https://www.wikidata.org/wiki/Q100');
    expect(atlas.events.find((x) => x.id === 'incident-228')!.reviewed).toBe(true);
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
