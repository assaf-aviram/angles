// 2D geometry helpers for the angle overlay.
// All functions work in SVG screen coordinates (y grows downward), which is
// fine because angles are invariant to a consistent axis flip.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);

function unit(v) {
  const l = len(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

// Round to a short, stable string ("-0" -> "0") for SVG path output.
function fmt(n) {
  return String(Number(n.toFixed(3)) || 0);
}

/**
 * The smaller interior angle (0..180°) at `vertex`, formed by the rays toward
 * `prev` and `next`. Returns 0 if a neighbor coincides with the vertex.
 */
export function interiorAngle(prev, vertex, next) {
  const a = sub(prev, vertex);
  const b = sub(next, vertex);
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return 0;
  let cos = (a.x * b.x + a.y * b.y) / (la * lb);
  cos = Math.min(1, Math.max(-1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** The reflex angle (the "outside" angle); complements interiorAngle to 360°. */
export function reflexAngle(prev, vertex, next) {
  return 360 - interiorAngle(prev, vertex, next);
}

/**
 * A point at distance `radius` from `vertex` along the angle bisector.
 * With `reflex: true`, returns the point on the opposite (outside) bisector.
 * Used to position angle labels.
 */
export function bisectorPoint(prev, vertex, next, radius, { reflex = false } = {}) {
  const ua = unit(sub(prev, vertex));
  const ub = unit(sub(next, vertex));
  let dir = unit({ x: ua.x + ub.x, y: ua.y + ub.y });
  if (dir.x === 0 && dir.y === 0) {
    // Straight line: bisector is undefined, use a perpendicular instead.
    dir = { x: -ua.y, y: ua.x };
  }
  const sign = reflex ? -1 : 1;
  return {
    x: vertex.x + sign * radius * dir.x,
    y: vertex.y + sign * radius * dir.y,
  };
}

/**
 * An SVG path string for the arc of `radius` swept at `vertex` between the ray
 * toward `prev` and the ray toward `next`. The minor (interior) arc is drawn by
 * default; pass `reflex: true` for the major arc that wraps the outside.
 */
export function arcPath(prev, vertex, next, radius, { reflex = false } = {}) {
  const ua = unit(sub(prev, vertex));
  const ub = unit(sub(next, vertex));
  const start = { x: vertex.x + radius * ua.x, y: vertex.y + radius * ua.y };
  const end = { x: vertex.x + radius * ub.x, y: vertex.y + radius * ub.y };

  // Signed shortest rotation from the prev-ray to the next-ray, in (-PI, PI].
  const a1 = Math.atan2(ua.y, ua.x);
  const a2 = Math.atan2(ub.y, ub.x);
  let delta = a2 - a1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;

  const largeArc = reflex ? 1 : 0;
  // Minor arc follows the short rotation; reflex arc goes the other way.
  const sweep = reflex ? (delta > 0 ? 0 : 1) : delta > 0 ? 1 : 0;

  return `M ${fmt(start.x)} ${fmt(start.y)} A ${fmt(radius)} ${fmt(
    radius,
  )} 0 ${largeArc} ${sweep} ${fmt(end.x)} ${fmt(end.y)}`;
}
