// Base map styles. All sources are free; the satellite imagery (EOX) is licensed
// for non-commercial use only, which matches this project.

import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Localized } from '../i18n';

export type StyleId = 'light' | 'streets' | 'dark' | 'terrain' | 'satellite' | 'historical';
export const DEFAULT_STYLE: StyleId = 'light';

const OPENFREEMAP = 'https://tiles.openfreemap.org/styles';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const FONT = ['Noto Sans Regular'];

export interface StyleDef {
  id: StyleId;
  name: Localized & { en: string };
  /** Vector styles can hide borders and labels; raster styles cannot. */
  vector: boolean;
  swatch: string; // CSS background for the switcher thumbnail
  load: () => Promise<StyleSpecification>;
}

function raster(id: string, tiles: string[], attribution: string, maxzoom = 18, tileSize = 256): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { [id]: { type: 'raster', tiles, tileSize, attribution, maxzoom } },
    layers: [{ id: `${id}-base`, type: 'raster', source: id }],
  };
}

export const STYLES: StyleDef[] = [
  {
    id: 'light',
    name: { 'zh-TW': '淺色', en: 'Light' },
    vector: true,
    swatch: 'linear-gradient(135deg,#f4f4f2 55%,#cdd9e3 55%)',
    load: () => fetchStyle(`${OPENFREEMAP}/positron`),
  },
  {
    id: 'streets',
    name: { 'zh-TW': '街道', en: 'Streets' },
    vector: true,
    swatch: 'linear-gradient(135deg,#f2efe9 40%,#f9d98c 40% 48%,#f2efe9 48% 70%,#aad3df 70%)',
    load: () => fetchStyle(`${OPENFREEMAP}/liberty`),
  },
  {
    id: 'dark',
    name: { 'zh-TW': '深色', en: 'Dark' },
    vector: false,
    swatch: 'linear-gradient(135deg,#2b2d31 55%,#1a1c20 55%)',
    load: async () =>
      raster(
        'carto-dark',
        ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        19,
      ),
  },
  {
    id: 'terrain',
    name: { 'zh-TW': '地形', en: 'Terrain' },
    vector: false,
    swatch: 'linear-gradient(135deg,#c8d9a8 35%,#e9dcb5 35% 65%,#b89f7a 65%)',
    load: async () =>
      raster(
        'opentopomap',
        ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
        17,
      ),
  },
  {
    id: 'satellite',
    name: { 'zh-TW': '衛星', en: 'Satellite' },
    vector: false,
    swatch: 'linear-gradient(135deg,#2f4a2a 40%,#5b6e3c 40% 60%,#1d3a5c 60%)',
    load: async () =>
      raster(
        'eox-s2',
        ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
        '<a href="https://s2maps.eu">Sentinel-2 cloudless – s2maps.eu</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2020), non-commercial use',
        14,
      ),
  },
  {
    id: 'historical',
    name: { 'zh-TW': '古地圖', en: 'Historical' },
    vector: true,
    swatch: 'linear-gradient(135deg,#efe4cc 55%,#b9c4bd 55%)',
    load: async () => historicalStyle(),
  },
];

/**
 * Fetch a vector style. If the tile provider is unreachable, fall back to a
 * plain background so the event markers and the rest of the app still work.
 */
async function fetchStyle(url: string): Promise<StyleSpecification> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as StyleSpecification;
  } catch (err) {
    console.warn(`Map style ${url} unavailable, using a plain fallback`, err);
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfe8ec' } }],
    };
  }
}

export const STYLE_IDS = STYLES.map((s) => s.id);
export const styleDef = (id: StyleId) => STYLES.find((s) => s.id === id) ?? STYLES[0];

/**
 * "Historical" style: the Positron vector style with modern borders, roads and
 * labels removed and recoloured like an old paper map, so present-day borders
 * don't mislead when looking at the past.
 */
async function historicalStyle(): Promise<StyleSpecification> {
  const base = await fetchStyle(`${OPENFREEMAP}/positron`);
  const keepSourceLayers = new Set(['water', 'waterway', 'landcover', 'park']);
  const layers: LayerSpecification[] = [];
  for (const layer of base.layers) {
    if (layer.type === 'background') {
      layers.push({ ...layer, paint: { 'background-color': '#efe4cc' } });
      continue;
    }
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
    if (!sourceLayer || !keepSourceLayers.has(sourceLayer)) continue;
    if (layer.type === 'fill') {
      const water = sourceLayer === 'water';
      layers.push({ ...layer, paint: { 'fill-color': water ? '#b9c4bd' : '#e3d4b0', 'fill-opacity': water ? 1 : 0.5 } });
    } else if (layer.type === 'line' && sourceLayer === 'waterway') {
      layers.push({ ...layer, paint: { 'line-color': '#a9b8b1', 'line-width': 1 } });
    }
  }
  return { ...base, layers };
}

// ---- terrain ---------------------------------------------------------------------------
// Elevation tiles from the AWS Open Data "Terrain Tiles" (Terrarium encoding).

export const DEM_SOURCE = {
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 14,
  attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Terrain Tiles</a>',
};
