import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/build-data';
import { inBounds, placeName, queryEvents } from './query';

const { atlas, errors } = buildAtlas();

describe('data', () => {
  it('builds without validation errors', () => {
    expect(errors).toEqual([]);
    expect(atlas.events.length).toBeGreaterThan(50);
  });

  it('adds inverse relations', () => {
    const zeelandia = atlas.events.find((e) => e.id === 'siege-of-fort-zeelandia')!;
    const dutch = atlas.events.find((e) => e.id === 'dutch-formosa')!;
    expect(zeelandia.relations).toContainEqual({ event: 'dutch-formosa', type: 'part_of' });
    expect(dutch.relations).toContainEqual({ event: 'siege-of-fort-zeelandia', type: 'has_part' });
  });

  it('turns Wikipedia titles into source links', () => {
    const e = atlas.events.find((e) => e.id === 'incident-228')!;
    expect(e.sources.some((s) => s.url.startsWith('https://en.wikipedia.org/wiki/February_28_incident'))).toBe(true);
  });
});

describe('queryEvents', () => {
  const base = { categories: new Set<never>(), showAll: false };

  it('returns events overlapping the range', () => {
    const { events } = queryEvents(atlas.events, atlas.places, { ...base, from: 1661, to: 1662, showAll: true });
    const ids = events.map((e) => e.id);
    expect(ids).toContain('siege-of-fort-zeelandia');
    expect(ids).toContain('qing-dynasty'); // long event spanning the range
    expect(ids).not.toContain('incident-228');
  });

  it('shows only major events for wide ranges', () => {
    const wide = queryEvents(atlas.events, atlas.places, { ...base, from: 0, to: 2026 });
    expect(wide.threshold).toBe(4);
    expect(wide.events.every((e) => e.importance >= 4)).toBe(true);
    const all = queryEvents(atlas.events, atlas.places, { ...base, from: 0, to: 2026, showAll: true });
    expect(all.events.length).toBeGreaterThan(wide.events.length);
  });

  it('filters by place and by map bounds', () => {
    const byPlace = queryEvents(atlas.events, atlas.places, { ...base, from: -29999, to: 2026, showAll: true, placeId: 'kinmen' });
    expect(byPlace.events.map((e) => e.id).sort()).toEqual(['battle-of-guningtou', 'second-taiwan-strait-crisis']);
    const taiwanBox = { west: 119, south: 21.5, east: 122.5, north: 25.5 };
    const inTaiwan = queryEvents(atlas.events, atlas.places, { ...base, from: 1900, to: 2026, showAll: true, bounds: taiwanBox });
    expect(inTaiwan.events.map((e) => e.id)).toContain('incident-228');
    expect(inTaiwan.events.map((e) => e.id)).not.toContain('korean-war');
  });
});

describe('places', () => {
  it('uses the name valid at the time', () => {
    const anping = atlas.places['tainan-anping'];
    expect(placeName(anping, 1630, 'zh-TW')).toBe('大員');
    expect(placeName(anping, 1700, 'en')).toBe('Anping');
  });

  it('handles bounds across the antimeridian', () => {
    expect(inBounds([179, 0], { west: 170, east: -170, south: -10, north: 10 })).toBe(true);
    expect(inBounds([0, 0], { west: 170, east: -170, south: -10, north: 10 })).toBe(false);
  });
});

describe('eras', () => {
  it('are listed chronologically within each group', () => {
    const taiwan = atlas.eras.filter((e) => e.group === 'taiwan').map((e) => e.id);
    expect(taiwan).toEqual(['tw-prehistory', 'tw-dutch-spanish', 'tw-tungning', 'tw-qing', 'tw-japan', 'tw-martial-law', 'tw-democracy']);
  });
});
