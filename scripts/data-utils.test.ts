import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clean, contentHash, isUntouchedImport, readRecords, writeRecord } from './data-utils';

describe('clean', () => {
  it('drops the empty values the CMS writes for blank optional fields', () => {
    expect(clean({ a: '', b: [], c: {}, d: null, e: { en: '', 'zh-TW': '臺灣' }, f: [{ x: '' }, 1], g: 0, h: false })).toEqual({
      e: { 'zh-TW': '臺灣' },
      f: [1],
      g: 0,
      h: false,
    });
  });
});

describe('importHash', () => {
  const event = { id: 'wd-q1', title: { 'zh-TW': '戰役', en: 'Battle' }, start: { year: 1900 } };

  it('ignores key order, formatting and empty fields', () => {
    const stored = { ...event, importHash: contentHash(event) };
    const reordered = { start: { year: 1900 }, importHash: stored.importHash, title: { en: 'Battle', 'zh-TW': '戰役' }, id: 'wd-q1', altNames: [], end: {} };
    expect(isUntouchedImport(reordered)).toBe(true);
  });

  it('detects an edit', () => {
    const stored = { ...event, importHash: contentHash(event) };
    expect(isUntouchedImport({ ...stored, title: { 'zh-TW': '某戰役', en: 'Battle' } })).toBe(false);
  });

  it('treats records without a hash (curated) as not ours', () => {
    expect(isUntouchedImport(event)).toBe(false);
  });

  it('survives a round trip through a YAML file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lookback-'));
    writeRecord(dir, 'wd-q1', { ...event, importHash: contentHash(event) });
    const [{ file, record }] = readRecords(dir);
    expect(file).toBe('wd-q1.yaml');
    expect(isUntouchedImport(record as object)).toBe(true);
    // Simulate a CMS save that rewrites formatting and adds empty fields.
    writeFileSync(join(dir, 'wd-q1.yaml'), readFileSync(join(dir, 'wd-q1.yaml'), 'utf8') + 'altNames: []\nsources: []\n');
    expect(isUntouchedImport(readRecords(dir)[0].record as object)).toBe(true);
  });
});
