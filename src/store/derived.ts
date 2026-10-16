import { useMemo } from 'react';
import { queryEvents, type QueryResult } from '../lib/query';
import type { AtlasEvent } from '../lib/types';
import { useStore } from './index';

const EMPTY: QueryResult = { events: [], inRange: 0, threshold: 1 };

/** Events for the sidebar: every filter applied. */
export function useListEvents(): QueryResult {
  const { atlas, from, to, categories, showAll, placeId, inViewOnly, bounds, includeImported } = useStore();
  return useMemo(
    () =>
      atlas
        ? queryEvents(atlas.events, atlas.places, {
            from,
            to,
            categories,
            showAll,
            includeImported,
            placeId: placeId ?? undefined,
            bounds: inViewOnly && bounds ? bounds : undefined,
          })
        : EMPTY,
    [atlas, from, to, categories, showAll, placeId, inViewOnly, bounds, includeImported],
  );
}

/** Events for the map: same, but not narrowed to one place or the current view. */
export function useMapEvents(): QueryResult {
  const { atlas, from, to, categories, showAll, includeImported } = useStore();
  return useMemo(
    () => (atlas ? queryEvents(atlas.events, atlas.places, { from, to, categories, showAll, includeImported }) : EMPTY),
    [atlas, from, to, categories, showAll, includeImported],
  );
}

export function useEventById(): (id: string | null | undefined) => AtlasEvent | undefined {
  const atlas = useStore((s) => s.atlas);
  const index = useMemo(() => new Map(atlas?.events.map((e) => [e.id, e]) ?? []), [atlas]);
  return (id) => (id ? index.get(id) : undefined);
}
