// Fetches Wikipedia signals for every event and writes data/importance.json.
// The data build turns these signals into a 1–5 importance (src/lib/importance.ts).
//
//   npm run importance
//
// Signals per event (from the `wikipedia:` titles in data/events/*.yaml):
//   - sitelinks: number of Wikipedia language editions with an article (Wikidata)
//   - viewsEn / viewsZh: page views over the last 12 full months
//
// Needs network access to wikidata.org and wikimedia.org. Runs monthly in
// .github/workflows/importance.yml, and can be run by hand.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { scoreToImportance, wikiScore } from '../src/lib/importance';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = { 'User-Agent': 'LookBack/0.1 (https://github.com/tiong-ui/look-back) importance script' };

interface RawEvent {
  id: string;
  wikipedia?: { en?: string; zh?: string };
}

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new Error(`GET ${url} failed`);
}

/** Wikidata sitelink counts for a batch of titles on one wiki. Follows redirects. */
async function sitelinks(site: 'enwiki' | 'zhwiki', titles: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&redirects=yes` +
      `&sites=${site}&titles=${encodeURIComponent(batch.join('|'))}`;
    const data = await getJson(url);
    for (const entity of Object.values<any>(data?.entities ?? {})) {
      if (!entity.sitelinks) continue;
      const title: string | undefined = entity.sitelinks[site]?.title;
      const count = Object.keys(entity.sitelinks).filter((k) => k.endsWith('wiki') && k !== 'commonswiki').length;
      if (title) out.set(norm(title), count);
    }
  }
  return out;
}

const norm = (t: string) => t.replace(/_/g, ' ').trim().toLowerCase();

function lastTwelveMonths(): [string, string] {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const fmt = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return [fmt(start), fmt(end)];
}

async function views(project: 'en.wikipedia' | 'zh.wikipedia', title: string): Promise<number> {
  const [start, end] = lastTwelveMonths();
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}/all-access/user/` +
    `${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${start}/${end}`;
  const data = await getJson(url);
  return (data?.items ?? []).reduce((sum: number, it: { views: number }) => sum + it.views, 0);
}

async function main() {
  const dir = join(ROOT, 'data', 'events');
  const files = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => join(dir, f));
  const imported = join(ROOT, 'data', 'imported', 'events.yaml');
  if (existsSync(imported)) files.push(imported);
  const events: RawEvent[] = files.flatMap((f) => (parse(readFileSync(f, 'utf8')) as RawEvent[]) ?? []);
  const withWiki = events.filter((e) => e.wikipedia?.en || e.wikipedia?.zh);

  const en = await sitelinks('enwiki', withWiki.flatMap((e) => (e.wikipedia?.en ? [e.wikipedia.en] : [])));
  const zh = await sitelinks('zhwiki', withWiki.flatMap((e) => (e.wikipedia?.zh ? [e.wikipedia.zh] : [])));

  const result: Record<string, { sitelinks: number; viewsEn: number; viewsZh: number; score: number; importance: number }> = {};
  // Fetch page views a few events at a time: fast enough for thousands of
  // events while staying well under Wikimedia's rate limits.
  const score = async (e: RawEvent) => {
    const links = Math.max(
      e.wikipedia?.en ? en.get(norm(e.wikipedia.en)) ?? 0 : 0,
      e.wikipedia?.zh ? zh.get(norm(e.wikipedia.zh)) ?? 0 : 0,
    );
    const [viewsEn, viewsZh] = await Promise.all([
      e.wikipedia?.en ? views('en.wikipedia', e.wikipedia.en) : 0,
      e.wikipedia?.zh ? views('zh.wikipedia', e.wikipedia.zh) : 0,
    ]);
    if (!links && !viewsEn && !viewsZh) {
      console.warn(`${e.id}: Wikipedia title not found, check data/events (editor importance kept)`);
      return;
    }
    const signals = { sitelinks: links, viewsEn, viewsZh };
    const s = wikiScore(signals);
    result[e.id] = { ...signals, score: Number(s.toFixed(3)), importance: scoreToImportance(s) };
  };
  const CONCURRENCY = 8;
  for (let i = 0; i < withWiki.length; i += CONCURRENCY) {
    await Promise.all(withWiki.slice(i, i + CONCURRENCY).map(score));
    if ((i / CONCURRENCY) % 25 === 0) console.log(`  ${Math.min(i + CONCURRENCY, withWiki.length)} / ${withWiki.length}`);
  }

  const missing = events.filter((e) => !result[e.id]).map((e) => e.id);
  if (missing.length) console.warn(`No Wikipedia title (editor importance kept): ${missing.join(', ')}`);

  writeFileSync(
    join(ROOT, 'data', 'importance.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), events: result }, null, 2) + '\n',
  );
  console.log(`Wrote data/importance.json (${Object.keys(result).length} events)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
