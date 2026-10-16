import type { Localized } from '../i18n';
import type { Category } from './categories';
import type { DatePoint, Precision } from './time';

export type Role = 'primary' | 'secondary' | 'origin' | 'destination' | 'area';
export type RelationType = 'causes' | 'caused_by' | 'part_of' | 'has_part' | 'precedes' | 'follows' | 'related';

export interface PlaceName {
  'zh-TW': string;
  en?: string;
  from?: number;
  to?: number;
}

export interface Place {
  id: string;
  coords: [number, number]; // [lng, lat]
  names: PlaceName[];
  modern?: Localized;
}

export interface SourceLink {
  url: string;
  title: Localized;
  resource?: string;
}

export interface Perspective {
  view: string;
  text: Localized;
}

export interface AtlasEvent {
  id: string;
  title: Localized;
  altNames?: Localized[];
  summary: Localized;
  start: DatePoint;
  end: DatePoint; // always set; equals start for point events
  precision: Precision;
  approximate: boolean;
  categories: Category[];
  regions: string[];
  importance: number;
  importanceSource: 'computed' | 'editor';
  /** false for events imported from Wikidata that no editor has checked yet */
  reviewed: boolean;
  locations: { place: string; role: Role }[];
  relations: { event: string; type: RelationType }[];
  perspectives: Perspective[];
  sources: SourceLink[];
}

export interface Era {
  id: string;
  group: string;
  name: Localized;
  from: number;
  to: number;
}

export interface Resource {
  id: string;
  name: Localized;
  url?: string;
  type: string;
  lang: string[];
  description?: Localized;
}

export interface Atlas {
  generatedAt: string;
  events: AtlasEvent[];
  places: Record<string, Place>;
  eras: Era[];
  eraGroups: Record<string, Localized>;
  resources: Resource[];
  resourceTypes: Record<string, Localized>;
  viewpoints: Record<string, Localized>;
}
