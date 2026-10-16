export type LngLat = [number, number];

/**
 * A gently curved line from a to b (quadratic Bézier in lng/lat space), used to
 * draw movements such as expeditions and migrations. Curving makes the
 * direction readable and keeps parallel routes from overlapping.
 */
export function arc(a: LngLat, b: LngLat, segments = 48, bend = 0.2): LngLat[] {
  let [x2, y2] = b;
  // Take the short way around the antimeridian.
  if (x2 - a[0] > 180) x2 -= 360;
  else if (a[0] - x2 > 180) x2 += 360;
  const [x1, y1] = a;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Control point: offset perpendicular to the chord, always bending the same side.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  const pts: LngLat[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  return pts;
}

/** Bounding box [[west, south], [east, north]] of points. */
export function bbox(points: LngLat[]): [LngLat, LngLat] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [[w, s], [e, n]];
}
