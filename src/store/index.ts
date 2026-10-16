import { create } from 'zustand';
import { DEFAULT_LANG, LANGS, type Lang } from '../i18n';
import { CATEGORY_IDS, type Category } from '../lib/categories';
import type { Bounds, SortKey } from '../lib/query';
import { clampYear } from '../lib/time';
import type { Atlas } from '../lib/types';
import { DEFAULT_STYLE, STYLE_IDS, type StyleId } from '../map/styles';

export const TAIWAN_CENTER: [number, number] = [120.96, 23.7];
export const DEFAULT_ZOOM = 4;

export interface MapView {
  center: [number, number];
  zoom: number;
}

export interface State {
  atlas: Atlas | null;
  loadError: string | null;

  from: number;
  to: number;
  lang: Lang;
  minguo: boolean;

  style: StyleId;
  terrain: boolean;
  globe: boolean;
  borders: boolean;
  labels: boolean;
  view: MapView;
  bounds: Bounds | null;

  selectedId: string | null;
  hoveredId: string | null;
  placeId: string | null;
  categories: Set<Category>;
  showAll: boolean;
  inViewOnly: boolean;
  sort: SortKey;

  /** Incremented to ask the map to fly back to Taiwan. */
  recenterTick: number;
  dialog: 'resources' | 'about' | null;

  set: (patch: Partial<State>) => void;
  setRange: (from: number, to: number) => void;
  toggleCategory: (c: Category) => void;
  select: (id: string | null) => void;
}

// ---- URL state ------------------------------------------------------------------
// Everything a person would want in a shared link lives in the query string.

function readUrl(): Partial<State> {
  const q = new URLSearchParams(window.location.search);
  const out: Partial<State> = {};
  const num = (k: string) => (q.has(k) && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const from = num('from');
  const to = num('to');
  if (from !== undefined) out.from = clampYear(from);
  if (to !== undefined) out.to = clampYear(to);
  if (out.from !== undefined && out.to !== undefined && out.from > out.to) [out.from, out.to] = [out.to, out.from];
  const lang = q.get('lang') as Lang | null;
  if (lang && LANGS.includes(lang)) out.lang = lang;
  const style = q.get('style') as StyleId | null;
  if (style && STYLE_IDS.includes(style)) out.style = style;
  if (q.get('terrain') === '1') out.terrain = true;
  if (q.get('globe') === '1') out.globe = true;
  if (q.get('borders') === '0') out.borders = false;
  if (q.get('labels') === '0') out.labels = false;
  if (q.get('minguo') === '1') out.minguo = true;
  if (q.get('event')) out.selectedId = q.get('event');
  if (q.get('place')) out.placeId = q.get('place');
  const cats = q.get('cat')?.split(',').filter((c): c is Category => CATEGORY_IDS.includes(c as Category));
  if (cats?.length) out.categories = new Set(cats);
  if (q.get('all') === '1') out.showAll = true;
  const lng = num('lng');
  const lat = num('lat');
  const z = num('z');
  if (lng !== undefined && lat !== undefined && z !== undefined) out.view = { center: [lng, lat], zoom: z };
  return out;
}

function writeUrl(s: State) {
  const q = new URLSearchParams();
  q.set('from', String(s.from));
  q.set('to', String(s.to));
  if (s.lang !== DEFAULT_LANG) q.set('lang', s.lang);
  if (s.style !== DEFAULT_STYLE) q.set('style', s.style);
  if (s.terrain) q.set('terrain', '1');
  if (s.globe) q.set('globe', '1');
  if (!s.borders) q.set('borders', '0');
  if (!s.labels) q.set('labels', '0');
  if (s.minguo) q.set('minguo', '1');
  if (s.selectedId) q.set('event', s.selectedId);
  if (s.placeId) q.set('place', s.placeId);
  if (s.categories.size) q.set('cat', [...s.categories].join(','));
  if (s.showAll) q.set('all', '1');
  q.set('lng', s.view.center[0].toFixed(3));
  q.set('lat', s.view.center[1].toFixed(3));
  q.set('z', s.view.zoom.toFixed(2));
  const url = `${window.location.pathname}?${q.toString().replace(/%2C/g, ',')}`;
  window.history.replaceState(null, '', url);
}

// ---- store ----------------------------------------------------------------------------

export const useStore = create<State>()((set, get) => ({
  atlas: null,
  loadError: null,
  from: 0, // 1 BC
  to: 2026,
  lang: DEFAULT_LANG,
  minguo: false,
  style: DEFAULT_STYLE,
  terrain: false,
  globe: false,
  borders: true,
  labels: true,
  view: { center: TAIWAN_CENTER, zoom: DEFAULT_ZOOM },
  bounds: null,
  selectedId: null,
  hoveredId: null,
  placeId: null,
  categories: new Set(),
  showAll: false,
  inViewOnly: false,
  sort: 'year',
  recenterTick: 0,
  dialog: null,

  ...readUrl(),

  set: (patch) => set(patch),
  setRange: (from, to) => set({ from: clampYear(Math.min(from, to)), to: clampYear(Math.max(from, to)) }),
  toggleCategory: (c) => {
    const next = new Set(get().categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    set({ categories: next });
  },
  select: (id) => set({ selectedId: id }),
}));

let urlTimer: number | undefined;
useStore.subscribe((s) => {
  window.clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => writeUrl(s), 250);
  document.documentElement.lang = s.lang === 'zh-TW' ? 'zh-Hant-TW' : 'en';
});
