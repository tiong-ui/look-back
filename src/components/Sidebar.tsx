import { useEffect, useRef, useState } from 'react';
import { loc, t, type Lang } from '../i18n';
import { CATEGORIES, CATEGORY_IDS } from '../lib/categories';
import { thresholdForWidth } from '../lib/importance';
import { placeName, sortEvents } from '../lib/query';
import { formatRange } from '../lib/time';
import type { Atlas, AtlasEvent } from '../lib/types';
import { useEventById, useListEvents } from '../store/derived';
import { useStore } from '../store';

export function Sidebar() {
  const s = useStore();
  const { atlas, lang, selectedId, sort, showAll, inViewOnly, includeImported, categories, placeId, set, toggleCategory } = s;
  const { events, inRange, threshold } = useListEvents();
  const sorted = sortEvents(events, sort);
  const [sheet, setSheet] = useState<'peek' | 'open'>('peek');

  // Render the list in pages so thousands of imported events stay fast.
  const PAGE = 200;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [events, sort]);
  const selectedIndex = selectedId ? sorted.findIndex((e) => e.id === selectedId) : -1;
  const shown = sorted.slice(0, Math.max(limit, selectedIndex + 1));
  const hasImported = atlas?.events.some((e) => !e.reviewed) ?? false;

  if (!atlas) return null;
  const place = placeId ? atlas.places[placeId] : undefined;

  return (
    <aside className={`sidebar sheet-${sheet}`} aria-label={t('panel', lang)}>
      <button type="button" className="sheet-handle" onClick={() => setSheet(sheet === 'open' ? 'peek' : 'open')} aria-expanded={sheet === 'open'}>
        <span className="grabber" />
      </button>
      <header className="sb-head">
        <h2>
          {t('events', lang)} <small>{t('showing', lang, { n: events.length, total: inRange })}</small>
        </h2>
        <div className="sb-tools">
          <select value={sort} onChange={(e) => set({ sort: e.target.value as typeof sort })} aria-label="Sort">
            <option value="year">{t('sortYear', lang)}</option>
            <option value="importance">{t('sortImportance', lang)}</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={inViewOnly} onChange={(e) => set({ inViewOnly: e.target.checked })} /> {t('inView', lang)}
          </label>
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => set({ showAll: e.target.checked })} /> {t('showAll', lang)}
          </label>
          {hasImported && (
            <label className="check" title={t('unreviewedNote', lang)}>
              <input type="checkbox" checked={includeImported} onChange={(e) => set({ includeImported: e.target.checked })} /> {t('includeImported', lang)}
            </label>
          )}
        </div>
        {!showAll && threshold > 1 && <p className="hint">{t('majorOnly', lang, { n: threshold })}</p>}
        <div className="cat-chips" role="group" aria-label="Categories">
          {CATEGORY_IDS.map((c) => (
            <button
              type="button"
              key={c}
              className={`chip cat ${categories.has(c) ? 'active' : ''}`}
              style={{ ['--cat' as string]: CATEGORIES[c].color }}
              aria-pressed={categories.has(c)}
              onClick={() => toggleCategory(c)}
              title={loc(CATEGORIES[c].name, lang)}
            >
              {CATEGORIES[c].icon} <span>{loc(CATEGORIES[c].name, lang)}</span>
            </button>
          ))}
        </div>
        {place && (
          <div className="place-filter">
            📍 {t('placeFilter', lang, { name: placeName(place, Math.round((s.from + s.to) / 2), lang) })}
            <button type="button" className="link-button" onClick={() => set({ placeId: null })}>{t('clear', lang)}</button>
          </div>
        )}
      </header>

      <ol className="event-list">
        {sorted.length === 0 && <li className="empty">{t('noEvents', lang)}</li>}
        {shown.map((e) => (
          <EventRow key={e.id} event={e} atlas={atlas} lang={lang} selected={e.id === selectedId} />
        ))}
        {shown.length < sorted.length && (
          <li className="more">
            <button type="button" className="btn" onClick={() => setLimit(shown.length + PAGE)}>
              {t('showMore', lang, { n: Math.min(PAGE, sorted.length - shown.length) })}
            </button>
          </li>
        )}
      </ol>
    </aside>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="dots" aria-label={`${n}/5`}>
      {'●'.repeat(n)}
      <span className="off">{'●'.repeat(5 - n)}</span>
    </span>
  );
}

function EventRow({ event: e, atlas, lang, selected }: { event: AtlasEvent; atlas: Atlas; lang: Lang; selected: boolean }) {
  const { select, set, minguo } = useStore();
  const byId = useEventById();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const fmt = { lang, minguo, precision: e.precision, approximate: e.approximate };
  const placeIds = [...new Set(e.locations.map((l) => l.place))];

  return (
    <li
      ref={ref}
      className={`event ${selected ? 'selected' : ''}`}
      onMouseEnter={() => set({ hoveredId: e.id })}
      onMouseLeave={() => set({ hoveredId: null })}
    >
      <button type="button" className="event-head" onClick={() => select(selected ? null : e.id)} aria-expanded={selected}>
        <span className="when">{formatRange(e.start, e.end, { ...fmt, minguo: false })}</span>
        <span className="title">
          <span className="cat-icon" style={{ background: CATEGORIES[e.categories[0]].color }} aria-hidden="true">
            {CATEGORIES[e.categories[0]].icon}
          </span>
          {loc(e.title, lang)}
          {!e.reviewed && <span className="badge-unreviewed" title={t('unreviewedNote', lang)}>{t('unreviewed', lang)}</span>}
        </span>
        <span className="meta">
          <Dots n={e.importance} />
          <span className="places">📍 {placeIds.map((p) => atlas.places[p] && placeName(atlas.places[p], e.start.year, lang)).join('・')}</span>
        </span>
      </button>

      {selected && (
        <div className="event-body">
          <p className="when-full">{formatRange(e.start, e.end, fmt)}</p>
          {e.altNames?.length ? (
            <p className="muted">{t('alsoKnownAs', lang)}：{e.altNames.map((n) => loc(n, lang)).join('、')}</p>
          ) : null}
          <p>{loc(e.summary, lang)}</p>
          {!e.reviewed && <p className="note-unreviewed">{t('unreviewedNote', lang)}</p>}

          <h4>{t('locations', lang)}</h4>
          <ul className="loc-list">
            {e.locations.map((l, i) => {
              const p = atlas.places[l.place];
              return (
                <li key={i}>
                  <span className={`role role-${l.role}`}>{t(`role_${l.role}`, lang)}</span>
                  <button type="button" className="link-button" onClick={() => set({ placeId: l.place })}>
                    {placeName(p, e.start.year, lang)}
                  </button>
                  {p.modern && <span className="muted"> （{loc(p.modern, lang)}）</span>}
                </li>
              );
            })}
          </ul>

          {e.relations.length > 0 && (
            <>
              <h4>{t('related', lang)}</h4>
              <div className="rel-chips">
                {e.relations.map((r) => {
                  const other = byId(r.event);
                  if (!other) return null;
                  return (
                    <button type="button" key={r.event} className="chip rel" onClick={() => jumpTo(other)}>
                      <b>{t(`rel_${r.type}`, lang)}</b> {loc(other.title, lang)}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {e.perspectives.length > 0 && (
            <>
              <h4>{t('perspectives', lang)}</h4>
              <dl className="perspectives">
                {e.perspectives.map((p, i) => (
                  <div key={i} className={`pv pv-${p.view}`}>
                    <dt>{loc(atlas.viewpoints[p.view], lang)}</dt>
                    <dd>{loc(p.text, lang)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {e.sources.length > 0 && (
            <>
              <h4>{t('sources', lang)}</h4>
              <ul className="sources">
                {e.sources.map((src, i) => (
                  <li key={i}>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer">{loc(src.title, lang)}</a>
                    ) : (
                      <span>📖 {loc(src.title, lang)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted small">
            {t('importance', lang)} <Dots n={e.importance} />
            {e.importanceSource === 'editor' && <> · {t('provisional', lang)}</>}
          </p>
        </div>
      )}
    </li>
  );
}

/** Select a related event, widening the time range if it falls outside. */
function jumpTo(e: AtlasEvent) {
  const s = useStore.getState();
  if (e.end.year < s.from || e.start.year > s.to) s.setRange(Math.min(s.from, e.start.year), Math.max(s.to, e.end.year));
  // Make sure it passes the importance threshold for the (possibly wider) range.
  const { from, to } = useStore.getState();
  s.set({ placeId: null, categories: new Set(), showAll: s.showAll || e.importance < thresholdForWidth(to - from) });
  s.select(e.id);
}
