export type Lang = 'zh-TW' | 'en';
export const LANGS: Lang[] = ['zh-TW', 'en'];
export const DEFAULT_LANG: Lang = 'zh-TW';

/** A string in both UI languages, as stored in the data files. */
export interface Localized {
  'zh-TW': string;
  en?: string;
}

export function loc(text: Localized | undefined, lang: Lang): string {
  if (!text) return '';
  return (lang === 'en' ? text.en : text['zh-TW']) || text['zh-TW'] || text.en || '';
}

const strings = {
  appName: { 'zh-TW': '回望', en: 'Look Back' },
  tagline: { 'zh-TW': '以臺灣為中心的歷史地圖', en: 'A history map centred on Taiwan' },
  events: { 'zh-TW': '歷史事件', en: 'Events' },
  showing: { 'zh-TW': '顯示 {n} / {total} 件', en: 'Showing {n} of {total}' },
  majorOnly: { 'zh-TW': '僅重大事件（重要度 ≥ {n}）', en: 'Major events only (importance ≥ {n})' },
  showAll: { 'zh-TW': '顯示全部', en: 'Show all' },
  inView: { 'zh-TW': '僅地圖範圍內', en: 'Only in map view' },
  sortYear: { 'zh-TW': '依年代', en: 'By year' },
  sortImportance: { 'zh-TW': '依重要度', en: 'By importance' },
  noEvents: { 'zh-TW': '此時間範圍內沒有符合條件的事件。', en: 'No matching events in this range.' },
  locations: { 'zh-TW': '地點', en: 'Places' },
  related: { 'zh-TW': '相關事件', en: 'Related events' },
  perspectives: { 'zh-TW': '各方觀點', en: 'Perspectives' },
  sources: { 'zh-TW': '資料來源', en: 'Sources' },
  alsoKnownAs: { 'zh-TW': '又稱', en: 'Also known as' },
  importance: { 'zh-TW': '重要度', en: 'Importance' },
  placeFilter: { 'zh-TW': '地點：{name}', en: 'Place: {name}' },
  clear: { 'zh-TW': '清除', en: 'Clear' },
  from: { 'zh-TW': '起', en: 'From' },
  to: { 'zh-TW': '迄', en: 'To' },
  play: { 'zh-TW': '播放', en: 'Play' },
  pause: { 'zh-TW': '暫停', en: 'Pause' },
  mapStyle: { 'zh-TW': '地圖樣式', en: 'Map style' },
  layers: { 'zh-TW': '圖層', en: 'Layers' },
  terrain: { 'zh-TW': '立體地形', en: '3D terrain' },
  globe: { 'zh-TW': '地球儀', en: 'Globe' },
  borders: { 'zh-TW': '現代國界', en: 'Modern borders' },
  labels: { 'zh-TW': '地名標籤', en: 'Place labels' },
  vectorOnly: { 'zh-TW': '僅適用於向量樣式', en: 'Vector styles only' },
  recenter: { 'zh-TW': '回到臺灣', en: 'Back to Taiwan' },
  minguo: { 'zh-TW': '顯示民國紀年', en: 'Show Minguo years' },
  resources: { 'zh-TW': '參考資源', en: 'Resources' },
  about: { 'zh-TW': '關於', en: 'About' },
  close: { 'zh-TW': '關閉', en: 'Close' },
  eventsHere: { 'zh-TW': '此地事件（目前範圍）', en: 'Events here (current range)' },
  filterHere: { 'zh-TW': '只看此地', en: 'Filter to this place' },
  loading: { 'zh-TW': '載入中…', en: 'Loading…' },
  loadError: { 'zh-TW': '資料載入失敗', en: 'Failed to load data' },
  role_primary: { 'zh-TW': '發生地', en: 'Location' },
  role_secondary: { 'zh-TW': '相關地', en: 'Also involved' },
  role_origin: { 'zh-TW': '出發地', en: 'Origin' },
  role_destination: { 'zh-TW': '目的地', en: 'Destination' },
  role_area: { 'zh-TW': '範圍', en: 'Area' },
  rel_causes: { 'zh-TW': '導致', en: 'Led to' },
  rel_caused_by: { 'zh-TW': '起因', en: 'Caused by' },
  rel_part_of: { 'zh-TW': '屬於', en: 'Part of' },
  rel_has_part: { 'zh-TW': '包含', en: 'Includes' },
  rel_precedes: { 'zh-TW': '之後', en: 'Followed by' },
  rel_follows: { 'zh-TW': '承接', en: 'Follows' },
  rel_related: { 'zh-TW': '相關', en: 'Related' },
  eras: { 'zh-TW': '時代', en: 'Eras' },
  panel: { 'zh-TW': '事件列表', en: 'Event list' },
  provisional: {
    'zh-TW': '重要度為編輯暫定值，尚未以維基百科指標計算。',
    en: 'Importance is an editor estimate; not yet computed from Wikipedia signals.',
  },
} satisfies Record<string, Localized & { en: string }>;

export type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = strings[key][lang];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
