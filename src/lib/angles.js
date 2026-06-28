import { interiorAngle } from "./geometry";

/**
 * The index of the vertex whose angle is the image's "main" value.
 * Falls back to the first computable angle (index 1) when nothing is marked or
 * the stored selection is out of range. Returns null when no angle exists yet.
 */
export function effectiveMainIndex(image) {
  const pts = image?.points ?? [];
  if (pts.length < 3) return null;
  const idx = image.mainPointIndex;
  if (idx != null && idx >= 1 && idx <= pts.length - 2) return idx;
  return 1;
}

/** Aspect-correct interior angle (degrees) at vertex `i`, or null. */
export function angleAt(image, i) {
  const pts = image?.points ?? [];
  if (!pts[i - 1] || !pts[i] || !pts[i + 1]) return null;
  const w = image.width || 1;
  const h = image.height || 1;
  const P = (p) => ({ x: p.x * w, y: p.y * h });
  return interiorAngle(P(pts[i - 1]), P(pts[i]), P(pts[i + 1]));
}

/** The image's main angle value in degrees, or null when none can be computed. */
export function mainAngleValue(image) {
  const i = effectiveMainIndex(image);
  return i == null ? null : angleAt(image, i);
}

function stats(values) {
  const n = values.length;
  const sum = values.reduce((s, v) => s + v, 0);
  return {
    count: n,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: sum / n,
    range: Math.max(...values) - Math.min(...values),
  };
}

/** Most common main-vertex index across images (for highlighting). */
export function sessionMainIndex(images) {
  const counts = new Map();
  for (const im of images) {
    const i = effectiveMainIndex(im);
    if (i != null) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [i, n] of counts) {
    if (n > bestN) {
      best = i;
      bestN = n;
    }
  }
  return best;
}

/**
 * Range stats (min/max/mean/range/count) for every interior vertex across all
 * images in a session. Returns rows sorted by vertex index; empty if no angles.
 */
export function sessionAngleStats(images) {
  const byIndex = new Map();
  for (const im of images) {
    const n = im.points?.length ?? 0;
    for (let i = 1; i <= n - 2; i++) {
      const v = angleAt(im, i);
      if (v == null) continue;
      if (!byIndex.has(i)) byIndex.set(i, []);
      byIndex.get(i).push(v);
    }
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, values]) => ({ index, ...stats(values) }));
}
