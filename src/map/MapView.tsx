import maplibregl, { type GeoJSONSource, type Map as MLMap, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as GeoJSON from 'geojson';
import { useEffect, useRef } from 'react';
import { loc, t, type Lang } from '../i18n';
import { CATEGORIES } from '../lib/categories';
import { arc, bbox, type LngLat } from '../lib/geo';
import { placeName } from '../lib/query';
import { formatRange } from '../lib/time';
import type { Atlas, AtlasEvent } from '../lib/types';
import { useEventById, useMapEvents } from '../store/derived';
import { TAIWAN_CENTER, DEFAULT_ZOOM, useStore, type State } from '../store';
import { DEM_SOURCE, FONT, styleDef } from './styles';

type FC = GeoJSON.FeatureCollection;
const empty = (): FC => ({ type: 'FeatureCollection', features: [] });
const OWN = 'lb-'; // prefix for our own sources and layers

const ACCENT = '#d4402b';
const ROLE_COLOR: Record<string, string> = {
  primary: ACCENT,
  destination: ACCENT,
  origin: '#ffffff',
  secondary: '#ffffff',
  area: ACCENT,
};

// ---- GeoJSON builders --------------------------------------------------------------------

function placesGeoJSON(atlas: Atlas, events: AtlasEvent[], year: number, lang: Lang): FC {
  const byPlace = new Map<string, AtlasEvent[]>();
  for (const e of events) {
    for (const placeId of new Set(e.locations.map((l) => l.place))) {
      if (!byPlace.has(placeId)) byPlace.set(placeId, []);
      byPlace.get(placeId)!.push(e);
    }
  }
  const features: GeoJSON.Feature[] = [];
  for (const [placeId, evs] of byPlace) {
    const place = atlas.places[placeId];
    if (!place) continue;
    const top = evs.reduce((a, b) => (b.importance > a.importance ? b : a));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: place.coords },
      properties: {
        placeId,
        name: placeName(place, year, lang),
        count: evs.length,
        maxImp: top.importance,
        color: CATEGORIES[top.categories[0]].color,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function eventPoints(atlas: Atlas, e: AtlasEvent | undefined, lang: Lang): FC {
  if (!e) return empty();
  const seen = new Map<string, string>(); // place → strongest role
  const rank = ['primary', 'destination', 'area', 'secondary', 'origin'];
  for (const l of e.locations) {
    const prev = seen.get(l.place);
    if (!prev || rank.indexOf(l.role) < rank.indexOf(prev)) seen.set(l.place, l.role);
  }
  return {
    type: 'FeatureCollection',
    features: [...seen].flatMap(([placeId, role]) => {
      const p = atlas.places[placeId];
      if (!p) return [];
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: p.coords },
        properties: { placeId, role, name: placeName(p, e.start.year, lang) },
      }];
    }),
  };
}

function eventArcs(atlas: Atlas, e: AtlasEvent | undefined): FC {
  if (!e) return empty();
  const origins = e.locations.filter((l) => l.role === 'origin');
  const dests = e.locations.filter((l) => l.role === 'destination');
  const features: GeoJSON.Feature[] = [];
  for (const o of origins)
    for (const d of dests) {
      const a = atlas.places[o.place];
      const b = atlas.places[d.place];
      if (!a || !b || a === b) continue;
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc(a.coords, b.coords) }, properties: {} });
    }
  return { type: 'FeatureCollection', features };
}

function primaryCoords(atlas: Atlas, e: AtlasEvent): LngLat | undefined {
  const l = e.locations.find((x) => x.role === 'primary' || x.role === 'destination') ?? e.locations[0];
  return atlas.places[l.place]?.coords;
}

function relationLinks(atlas: Atlas, e: AtlasEvent | undefined, byId: (id: string) => AtlasEvent | undefined, lang: Lang): FC {
  if (!e) return empty();
  const from = primaryCoords(atlas, e);
  if (!from) return empty();
  const features: GeoJSON.Feature[] = [];
  for (const r of e.relations) {
    const other = byId(r.event);
    const to = other && primaryCoords(atlas, other);
    if (!other || !to || (to[0] === from[0] && to[1] === from[1])) continue;
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc(from, to, 32, 0.12) }, properties: {} });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: to },
      properties: { label: `${t(`rel_${r.type}`, lang)}：${loc(other.title, lang)}` },
    });
  }
  return { type: 'FeatureCollection', features };
}

// ---- layers ------------------------------------------------------------------------------------

function addOverlay(map: MLMap) {
  const src = (id: string, extra: object = {}) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty(), ...extra });
  };
  src(`${OWN}places`, {
    cluster: true,
    clusterMaxZoom: 5,
    clusterRadius: 36,
    clusterProperties: { count: ['+', ['get', 'count']], maxImp: ['max', ['get', 'maxImp']] },
  });
  src(`${OWN}rel`);
  src(`${OWN}arcs`, { lineMetrics: true });
  src(`${OWN}sel`);
  src(`${OWN}hover`);

  const font = FONT;
  const halo = { 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.5 };

  map.addLayer({
    id: `${OWN}rel-lines`, type: 'line', source: `${OWN}rel`, filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#556', 'line-width': 1.5, 'line-dasharray': [1, 2], 'line-opacity': 0.7 },
  });
  map.addLayer({
    id: `${OWN}arcs`, type: 'line', source: `${OWN}arcs`,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ACCENT, 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] },
  });
  map.addLayer({
    id: `${OWN}clusters`, type: 'circle', source: `${OWN}places`, filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#1f6f5c',
      'circle-opacity': 0.85,
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 2, 13, 20, 20, 80, 28],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: `${OWN}cluster-count`, type: 'symbol', source: `${OWN}places`, filter: ['has', 'point_count'],
    layout: { 'text-field': ['to-string', ['get', 'count']], 'text-font': font, 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: `${OWN}places`, type: 'circle', source: `${OWN}places`, filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['+', 4, ['*', 1.6, ['get', 'maxImp']]],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9,
    },
  });
  map.addLayer({
    id: `${OWN}place-labels`, type: 'symbol', source: `${OWN}places`, filter: ['!', ['has', 'point_count']], minzoom: 4.5,
    layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#333', ...halo },
  });
  map.addLayer({
    id: `${OWN}rel-points`, type: 'circle', source: `${OWN}rel`, filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#556', 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: `${OWN}rel-labels`, type: 'symbol', source: `${OWN}rel`, filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11, 'text-offset': [0, -1.4], 'text-anchor': 'bottom', 'text-max-width': 14, 'text-optional': true },
    paint: { 'text-color': '#445', ...halo },
  });
  map.addLayer({
    id: `${OWN}hover`, type: 'circle', source: `${OWN}hover`,
    paint: { 'circle-radius': 16, 'circle-color': 'rgba(212,64,43,0.15)', 'circle-stroke-color': ACCENT, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: `${OWN}sel`, type: 'circle', source: `${OWN}sel`,
    paint: {
      'circle-radius': ['match', ['get', 'role'], 'primary', 11, 'destination', 10, 8] as ExpressionSpecification,
      'circle-color': ['match', ['get', 'role'], 'primary', ROLE_COLOR.primary, 'destination', ROLE_COLOR.destination, 'area', ROLE_COLOR.area, '#ffffff'] as ExpressionSpecification,
      'circle-stroke-color': ACCENT,
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: `${OWN}sel-labels`, type: 'symbol', source: `${OWN}sel`,
    layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 13, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': true },
    paint: { 'text-color': '#7a1f12', ...halo, 'text-halo-width': 2 },
  });
}

/** Terrain: hillshade on the base map, plus 3D relief when `relief` is on. */
function applyTerrain(map: MLMap, hillshade: boolean, relief: boolean) {
  if (hillshade || relief) {
    if (!map.getSource(`${OWN}dem`)) map.addSource(`${OWN}dem`, DEM_SOURCE);
    if (!map.getSource(`${OWN}dem-hs`)) map.addSource(`${OWN}dem-hs`, DEM_SOURCE);
  }
  if (hillshade && !map.getLayer(`${OWN}hillshade`)) {
    const firstOwn = map.getStyle().layers.find((l) => l.id.startsWith(OWN))?.id;
    map.addLayer(
      { id: `${OWN}hillshade`, type: 'hillshade', source: `${OWN}dem-hs`, paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#5a4a3a' } },
      firstOwn,
    );
  } else if (!hillshade && map.getLayer(`${OWN}hillshade`)) {
    map.removeLayer(`${OWN}hillshade`);
  }
  map.setTerrain(relief ? { source: `${OWN}dem`, exaggeration: 1.5 } : null);
}

/** Borders, labels and label language on vector base styles. */
function applyBaseLayers(map: MLMap, s: Pick<State, 'borders' | 'labels' | 'lang'>) {
  const nameExpr: ExpressionSpecification =
    s.lang === 'zh-TW'
      ? ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith(OWN)) continue;
    if ('source-layer' in layer && layer['source-layer'] === 'boundary') {
      map.setLayoutProperty(layer.id, 'visibility', s.borders ? 'visible' : 'none');
    }
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', s.labels ? 'visible' : 'none');
      const field = layer.layout?.['text-field'];
      if (field && JSON.stringify(field).includes('name')) map.setLayoutProperty(layer.id, 'text-field', nameExpr);
    }
  }
}

/** Space covered by the panels, so the map centres Taiwan (and selections) in the visible area. */
function panelPadding() {
  const wide = window.innerWidth > 820;
  return wide
    ? { top: 60, bottom: 160, left: 0, right: 420 }
    : { top: 56, bottom: Math.round(window.innerHeight * 0.4), left: 0, right: 0 };
}
const FIT_MARGIN = 50;

// ---- component ----------------------------------------------------------------------------------

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);

  const s = useStore();
  const { events } = useMapEvents();
  const byId = useEventById();
  const latest = useRef({ s, events, byId });
  latest.current = { s, events, byId };

  const def = styleDef(s.style);
  const midYear = Math.round((s.from + s.to) / 2);

  // Push all overlay data to the map from the latest state.
  const sync = () => {
    const map = mapRef.current;
    const { s, events, byId } = latest.current;
    if (!map || !ready.current || !s.atlas) return;
    const atlas = s.atlas;
    const sel = byId(s.selectedId);
    const year = sel ? sel.start.year : Math.round((s.from + s.to) / 2);
    (map.getSource(`${OWN}places`) as GeoJSONSource | undefined)?.setData(placesGeoJSON(atlas, events, year, s.lang));
    (map.getSource(`${OWN}sel`) as GeoJSONSource | undefined)?.setData(eventPoints(atlas, sel, s.lang));
    (map.getSource(`${OWN}arcs`) as GeoJSONSource | undefined)?.setData(eventArcs(atlas, sel));
    (map.getSource(`${OWN}rel`) as GeoJSONSource | undefined)?.setData(relationLinks(atlas, sel, byId, s.lang));
    (map.getSource(`${OWN}hover`) as GeoJSONSource | undefined)?.setData(
      s.hoveredId !== s.selectedId ? eventPoints(atlas, byId(s.hoveredId), s.lang) : empty(),
    );
  };

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const { s } = latest.current;
    const map = new maplibregl.Map({
      container: container.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef0' } }] },
      center: s.view.center,
      zoom: s.view.zoom,
      minZoom: 1,
      maxZoom: 16,
      maxPitch: 70,
      attributionControl: { compact: true },
      localIdeographFontFamily: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
    });
    mapRef.current = map;
    map.setPadding(panelPadding());
    const onResize = () => map.setPadding(panelPadding());
    window.addEventListener('resize', onResize);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    const reportView = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      useStore.getState().set({
        view: { center: [c.lng, c.lat], zoom: map.getZoom() },
        bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      });
    };
    map.on('moveend', reportView);
    map.once('load', reportView);

    // Clusters: zoom in. Places: list their events.
    map.on('click', `${OWN}clusters`, async (ev) => {
      const f = ev.features?.[0];
      if (!f) return;
      const zoom = await (map.getSource(`${OWN}places`) as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as LngLat, zoom });
    });
    const onPlace = (ev: maplibregl.MapLayerMouseEvent) => {
      const placeId = ev.features?.[0]?.properties.placeId as string | undefined;
      if (placeId) openPlacePopup(placeId, ev.lngLat);
    };
    map.on('click', `${OWN}places`, onPlace);
    map.on('click', `${OWN}sel`, onPlace);
    for (const layer of [`${OWN}clusters`, `${OWN}places`, `${OWN}sel`]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    // Animated dashes along movement arcs.
    const dashes = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ];
    let step = -1;
    let raf = 0;
    const animate = (ts: number) => {
      const next = Math.floor(ts / 70) % dashes.length;
      if (next !== step && ready.current && map.getLayer(`${OWN}arcs`)) {
        map.setPaintProperty(`${OWN}arcs`, 'line-dasharray', dashes[next]);
        step = next;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPlacePopup(placeId: string, at: maplibregl.LngLatLike) {
    const map = mapRef.current;
    const { s, events } = latest.current;
    if (!map || !s.atlas) return;
    const place = s.atlas.places[placeId];
    const here = events.filter((e) => e.locations.some((l) => l.place === placeId));
    const lang = s.lang;

    const root = document.createElement('div');
    root.className = 'place-popup';
    const h = document.createElement('h3');
    h.textContent = placeName(place, Math.round((s.from + s.to) / 2), lang);
    root.appendChild(h);
    if (place.modern) {
      const m = document.createElement('div');
      m.className = 'muted';
      m.textContent = loc(place.modern, lang);
      root.appendChild(m);
    }
    const sub = document.createElement('div');
    sub.className = 'popup-sub';
    sub.textContent = `${t('eventsHere', lang)} · ${here.length}`;
    root.appendChild(sub);
    const ul = document.createElement('ul');
    for (const e of here.slice(0, 12)) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="popup-year"></span> <span class="popup-title"></span>`;
      (b.querySelector('.popup-year') as HTMLElement).textContent = formatRange(e.start, undefined, { lang, precision: 'year', approximate: e.approximate });
      (b.querySelector('.popup-title') as HTMLElement).textContent = `${CATEGORIES[e.categories[0]].icon} ${loc(e.title, lang)}`;
      b.onclick = () => {
        useStore.getState().select(e.id);
        popup.current?.remove();
      };
      li.appendChild(b);
      ul.appendChild(li);
    }
    root.appendChild(ul);
    const filter = document.createElement('button');
    filter.type = 'button';
    filter.className = 'link-button';
    filter.textContent = t('filterHere', lang);
    filter.onclick = () => {
      useStore.getState().set({ placeId });
      popup.current?.remove();
    };
    root.appendChild(filter);

    popup.current?.remove();
    popup.current = new maplibregl.Popup({ maxWidth: '300px', offset: 12 }).setLngLat(at).setDOMContent(root).addTo(map);
  }

  // Base style: load, then (re)attach our overlay, projection, terrain and label settings.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    ready.current = false;
    def.load().then(
      (style) => {
        if (cancelled) return;
        map.setStyle(style, { diff: false });
        map.once('style.load', () => {
          if (cancelled) return;
          const { s } = latest.current;
          addOverlay(map);
          ready.current = true;
          map.setProjection({ type: s.globe ? 'globe' : 'mercator' });
          applyTerrain(map, s.terrain || s.style === 'historical', s.terrain);
          applyBaseLayers(map, s);
          sync();
        });
      },
      (err) => console.error('Failed to load map style', err),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.style]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current) map.setProjection({ type: s.globe ? 'globe' : 'mercator' });
  }, [s.globe]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    applyTerrain(map, s.terrain || s.style === 'historical', s.terrain);
    map.easeTo({ pitch: s.terrain ? 55 : 0, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.terrain]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready.current && def.vector) applyBaseLayers(map, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.borders, s.labels, s.lang]);

  // Overlay data.
  useEffect(sync, [events, s.selectedId, s.hoveredId, s.lang, midYear, s.atlas]);

  // Fly to the selected event's places.
  useEffect(() => {
    const map = mapRef.current;
    const sel = byId(s.selectedId);
    if (!map || !sel || !s.atlas) return;
    const pts = sel.locations.map((l) => s.atlas!.places[l.place]?.coords).filter((c): c is LngLat => !!c);
    if (!pts.length) return;
    const [[w, so], [e, n]] = bbox(pts);
    if (w === e && so === n) map.flyTo({ center: [w, so], zoom: Math.max(map.getZoom(), 6.5), duration: 1200 });
    else map.fitBounds([[w, so], [e, n]], { padding: FIT_MARGIN, maxZoom: 8, duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.selectedId, s.atlas]);

  // "Back to Taiwan"
  useEffect(() => {
    if (s.recenterTick) mapRef.current?.flyTo({ center: TAIWAN_CENTER, zoom: DEFAULT_ZOOM, pitch: s.terrain ? 55 : 0, bearing: 0, duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.recenterTick]);

  return <div ref={container} className="map" role="region" aria-label="Map" />;
}
