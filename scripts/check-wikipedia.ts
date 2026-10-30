// Checks every event's Wikipedia titles against Wikipedia itself.
//
//   npm run check:wikipedia
//
// For each event with `wikipedia: { en, zh }`:
//   - reports titles that don't exist (a typo or a renamed article);
//   - reports titles that are redirects, with the article they lead to;
//   - for events with an English title but no Chinese one, looks up the
//     Chinese article through Wikipedia's language links and suggests it.
//
// It prints a JSON block of suggested fixes at the end, and exits with an
// error if any title doesn't exist. Needs network access to wikipedia.org,
// so it runs in .github/workflows/wikipedia.yml.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecords } from './data-utils';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = { 'User-Agent': 'LookBack/0.1 (https://github.com/tiong-ui/look-back) Wikipedia title check' };

interface Event {
  id: string;
  wikipedia?: { en?: string; zh?: string };
}

interface PageInfo {
  exists: boolean;
  resolved: string; // title after normalisation and redirects
  zh?: string; // Chinese language link (English wiki only)
}

const norm = (t: string) => t.replace(/_/g, ' ').trim();

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res.json();
    } catch {
      // retry below
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`GET ${url} failed`);
}

/** Look up titles on one wiki, 50 at a time, following redirects. */
async function lookup(wiki: 'en' | 'zh', titles: string[]): Promise<Map<string, PageInfo>> {
  const out = new Map<string, PageInfo>();
  const unique = [...new Set(titles.map(norm))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      titles: batch.join('|'),
      ...(wiki === 'en' ? { prop: 'langlinks', lllang: 'zh', lllimit: 'max' } : {}),
    });
    const data = await getJson(`https://${wiki}.wikipedia.org/w/api.php?${params}`);
    const q = data.query ?? {};
    // Map each requested title through normalisation and redirects.
    const step = new Map<string, string>();
    for (const n of q.normalized ?? []) step.set(n.from, n.to);
    for (const r of q.redirects ?? []) step.set(r.from, r.to);
    const pages = new Map<string, any>((q.pages ?? []).map((p: any) => [p.title, p]));
    for (const t of batch) {
      let cur = t;
      for (let hops = 0; hops < 5 && step.has(cur); hops++) cur = step.get(cur)!;
      const page = pages.get(cur);
      out.set(t, {
        exists: !!page && !page.missing && !page.invalid,
        resolved: cur,
        zh: page?.langlinks?.[0]?.title,
      });
    }
  }
  return out;
}

async function main() {
  const events = readRecords(join(ROOT, 'data', 'events'))
    .map(({ record }) => record as Event)
    .filter((e) => e?.wikipedia?.en || e?.wikipedia?.zh);
  const en = await lookup('en', events.flatMap((e) => (e.wikipedia?.en ? [e.wikipedia.en] : [])));
  const zh = await lookup('zh', events.flatMap((e) => (e.wikipedia?.zh ? [e.wikipedia.zh] : [])));

  const missing: string[] = [];
  const redirects: string[] = [];
  const suggestions: Record<string, { en?: string; zh?: string }> = {};
  for (const e of events) {
    const s: { en?: string; zh?: string } = {};
    if (e.wikipedia?.en) {
      const info = en.get(norm(e.wikipedia.en))!;
      if (!info.exists) missing.push(`${e.id}: English article "${e.wikipedia.en}" not found`);
      else {
        if (info.resolved !== norm(e.wikipedia.en)) {
          redirects.push(`${e.id}: en "${e.wikipedia.en}" → "${info.resolved}"`);
          s.en = info.resolved;
        }
        if (!e.wikipedia.zh && info.zh) s.zh = info.zh;
      }
    }
    if (e.wikipedia?.zh) {
      const info = zh.get(norm(e.wikipedia.zh))!;
      if (!info.exists) missing.push(`${e.id}: Chinese article "${e.wikipedia.zh}" not found`);
      else if (info.resolved !== norm(e.wikipedia.zh)) redirects.push(`${e.id}: zh "${e.wikipedia.zh}" → "${info.resolved}"`);
    }
    if (s.en || s.zh) suggestions[e.id] = s;
  }

  console.log(`Checked ${events.length} events: ${en.size} English and ${zh.size} Chinese titles.`);
  if (redirects.length) console.log(`\nRedirects (${redirects.length}), fine but could point at the article directly:\n  ${redirects.join('\n  ')}`);
  const zhCount = Object.values(suggestions).filter((s) => s.zh).length;
  if (zhCount) console.log(`\n${zhCount} events have no Chinese title but a Chinese article exists; see the JSON below.`);
  console.log('\nSUGGESTIONS_JSON_BEGIN');
  console.log(JSON.stringify(suggestions));
  console.log('SUGGESTIONS_JSON_END');
  if (missing.length) {
    console.error(`\n✖ ${missing.length} title(s) not found on Wikipedia:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\n✔ Every Wikipedia title exists.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
