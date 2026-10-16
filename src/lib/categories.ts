import type { Localized } from '../i18n';

export interface CategoryDef {
  icon: string;
  color: string; // marker / chip colour; each also has an icon so colour is never the only cue
  name: Localized & { en: string };
}

export const CATEGORIES = {
  prehistory: { icon: '🏺', color: '#9a6b3f', name: { 'zh-TW': '史前', en: 'Prehistory' } },
  politics: { icon: '🏛️', color: '#3b5b9a', name: { 'zh-TW': '政治', en: 'Politics' } },
  dynasty: { icon: '👑', color: '#7d4ba3', name: { 'zh-TW': '王朝政權', en: 'Dynasties & regimes' } },
  war: { icon: '⚔️', color: '#b23b3b', name: { 'zh-TW': '戰爭衝突', en: 'War & conflict' } },
  diplomacy: { icon: '🤝', color: '#2f8a8a', name: { 'zh-TW': '外交條約', en: 'Diplomacy & treaties' } },
  democracy: { icon: '🗳️', color: '#1f8a4c', name: { 'zh-TW': '民主人權', en: 'Democracy & rights' } },
  trade: { icon: '⚓', color: '#c07a12', name: { 'zh-TW': '貿易', en: 'Trade' } },
  migration: { icon: '🧭', color: '#5e7d2a', name: { 'zh-TW': '遷徙探索', en: 'Migration & exploration' } },
  religion: { icon: '☸️', color: '#a35d86', name: { 'zh-TW': '宗教', en: 'Religion' } },
  culture: { icon: '🎭', color: '#c2577a', name: { 'zh-TW': '文化社會', en: 'Culture & society' } },
  disaster: { icon: '🌋', color: '#6b6b6b', name: { 'zh-TW': '災害疫病', en: 'Disasters & epidemics' } },
} satisfies Record<string, CategoryDef>;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];
