// Shared helpers for reading and writing the data folder.
//
// Every record (event, place, resource, era) is one YAML file named after its
// id, e.g. data/events/siege-of-fort-zeelandia.yaml. One file per record is
// what the CMS edits, and it keeps Git history and diffs readable.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as OpenCC from 'opencc-js';
import { parse, stringify } from 'yaml';

/** Simplified → Taiwan Traditional (with Taiwan word usage). Wikidata's generic zh labels and many zh Wikipedia titles are Simplified. */
export const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' });

/**
 * Drop empty values (null, '', [], {}) recursively. The CMS writes empty
 * strings and lists for optional fields left blank; to the data they mean
 * "not set".
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(clean).filter((v) => !isEmpty(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (!isEmpty(c)) out[k] = c;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/** JSON with keys sorted at every level, so equal data always gives equal text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint of a record's content, ignoring formatting, key order, empty
 * fields and the importHash field itself. The importer stores it on every
 * record it writes; if the content no longer matches, someone edited the
 * record and the importer leaves it alone.
 */
export function contentHash(record: object): string {
  const { importHash: _ignored, ...rest } = clean(record) as Record<string, unknown>;
  return createHash('sha1').update(canonical(rest)).digest('hex').slice(0, 12);
}

/** True for a record the importer wrote and nobody has changed since. */
export function isUntouchedImport(record: object): boolean {
  const hash = (record as { importHash?: unknown }).importHash;
  return typeof hash === 'string' && hash === contentHash(record);
}

/** Read every *.yaml file in a folder; each file holds one record. */
export function readRecords(dir: string): { file: string; record: unknown }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => ({ file: f, record: parse(readFileSync(join(dir, f), 'utf8')) }));
}

export function writeRecord(dir: string, id: string, record: object): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.yaml`), stringify(record, { lineWidth: 0 }));
}
