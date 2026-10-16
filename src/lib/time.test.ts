import { describe, expect, it } from 'vitest';
import { TIMELINE_MAX, TIMELINE_MIN, formatYear, parseYear, posToYear, toHistorical, yearToPos } from './time';

describe('astronomical years', () => {
  it('has no year 0 in historical numbering', () => {
    expect(toHistorical(0)).toEqual({ n: 1, bc: true });
    expect(toHistorical(-1)).toEqual({ n: 2, bc: true });
    expect(toHistorical(1)).toEqual({ n: 1, bc: false });
  });

  it('formats years in both languages', () => {
    expect(formatYear(0, { lang: 'zh-TW' })).toBe('西元前1年');
    expect(formatYear(-199, { lang: 'en' })).toBe('200 BC');
    expect(formatYear(618, { lang: 'en' })).toBe('AD 618');
    expect(formatYear(1949, { lang: 'zh-TW', minguo: true })).toBe('1949年（民國38年）');
    expect(formatYear(1661, { lang: 'en', approximate: true })).toBe('c. 1661');
  });
});

describe('parseYear', () => {
  it.each([
    ['1661', 1661],
    ['AD 200', 200],
    ['200 BC', -199],
    ['200BCE', -199],
    ['-200', -199],
    ['西元前200', -199],
    ['前200年', -199],
    ['西元1895年', 1895],
    ['民國50', 1961],
    ['民國前1年', 1911],
  ])('%s → %d', (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });

  it('rejects nonsense', () => {
    expect(parseYear('hello')).toBeNull();
    expect(parseYear('')).toBeNull();
  });
});

describe('timeline scale', () => {
  it('maps the ends of the range to 0 and 1', () => {
    expect(yearToPos(TIMELINE_MIN)).toBe(0);
    expect(yearToPos(TIMELINE_MAX)).toBe(1);
  });

  it('is monotonic and round-trips', () => {
    let prev = -1;
    for (let y = TIMELINE_MIN; y <= TIMELINE_MAX; y += 97) {
      const p = yearToPos(y);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    for (const y of [-20000, -3000, 0, 618, 1624, 1895, 1947, 2026]) {
      expect(Math.abs(posToYear(yearToPos(y)) - y)).toBeLessThanOrEqual(Math.max(1, Math.abs(y) / 1000));
    }
  });

  it('gives recent history more room than deep prehistory', () => {
    const modern = yearToPos(2026) - yearToPos(1900);
    const paleo = yearToPos(-3999) - yearToPos(TIMELINE_MIN);
    expect(modern).toBeGreaterThan(paleo);
  });
});
