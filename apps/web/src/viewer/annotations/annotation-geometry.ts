import type { Annotation, MeasurementKind, Point } from './measure-math';

/** Image pixel <-> canvas (CSS px) mapping of the CURRENT view. */
export type ImageMapper = {
  toCanvas(p: Point): Point;
  toImage(p: Point): Point;
};

export type Shape = Pick<Annotation, 'kind' | 'points'>;
export type Hit = { id: string; handle: number | null };

const ELLIPSE_SAMPLES = 48;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (v: Point) => Math.hypot(v[0], v[1]);

export const canvasDistance = (a: Point, b: Point) => len(sub(a, b));

/** Opposite bounding-box corners, normalised to [min, max]. */
function box([a = [0, 0], b = a]: Point[]): [Point, Point] {
  return [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  ];
}

/**
 * Editable handles in image coordinates: line/angle points, the four corners of
 * a rectangle, the four axis ends of an ellipse.
 */
export function handlesOf({ kind, points }: Shape): Point[] {
  if (kind === 'length' || kind === 'angle') return points;
  const [a = [0, 0], b = a] = points;
  if (kind === 'rectangle') return [a, [b[0], a[1]], b, [a[0], b[1]]];
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  return [
    [a[0], cy],
    [b[0], cy],
    [cx, a[1]],
    [cx, b[1]],
  ];
}

/** New points after dragging handle `index` to image point `p`. */
export function moveHandle({ kind, points }: Shape, index: number, p: Point): Point[] {
  if (kind === 'length' || kind === 'angle') return points.map((q, i) => (i === index ? p : q));
  const [a = [0, 0], b = a] = points;
  // Which defining point's x / y the handle drives (-1: none). Rectangle corner
  // k is (x of point XS[k], y of point YS[k]); ellipse handles are the left,
  // right, top and bottom axis ends.
  const xs = kind === 'rectangle' ? [0, 1, 1, 0] : [0, 1, -1, -1];
  const ys = kind === 'rectangle' ? [0, 0, 1, 1] : [-1, -1, 0, 1];
  const pick = (which: number, own: Point): Point => [
    xs[index] === which ? p[0] : own[0],
    ys[index] === which ? p[1] : own[1],
  ];
  return [pick(0, a), pick(1, b)];
}

/** Outline in image coordinates (closed for rectangle and ellipse). */
export function outlineOf({ kind, points }: Shape): { points: Point[]; closed: boolean } {
  if (kind === 'length' || kind === 'angle') return { points, closed: false };
  const [min, max] = box(points);
  if (kind === 'rectangle') {
    return { points: [min, [max[0], min[1]], max, [min[0], max[1]]], closed: true };
  }
  const c: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const r: Point = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2];
  const ring = Array.from({ length: ELLIPSE_SAMPLES }, (_, i): Point => {
    const t = (i / ELLIPSE_SAMPLES) * 2 * Math.PI;
    return [c[0] + r[0] * Math.cos(t), c[1] + r[1] * Math.sin(t)];
  });
  return { points: ring, closed: true };
}

/**
 * Canvas ellipse for SVG: centre, radii and rotation. The view transform is a
 * rotation by quarter turns, flips and scaling, so the image axes stay
 * perpendicular on screen and an <ellipse> with a rotation is exact.
 */
export function ellipseOnCanvas(points: Point[], mapper: ImageMapper) {
  const [min, max] = box(points);
  const c: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const centre = mapper.toCanvas(c);
  const u = sub(mapper.toCanvas([max[0], c[1]]), centre);
  const v = sub(mapper.toCanvas([c[0], max[1]]), centre);
  return {
    cx: centre[0],
    cy: centre[1],
    rx: len(u),
    ry: len(v),
    rotation: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
  };
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t =
    l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
  return canvasDistance(p, [a[0] + t * ab[0], a[1] + t * ab[1]]);
}

/** Canvas distance from `p` to a polyline (closing it when `closed`). */
export function polylineDistance(p: Point, line: Point[], closed: boolean): number {
  let best = Infinity;
  const n = line.length;
  if (n === 1 && line[0]) return canvasDistance(p, line[0]);
  for (let i = 0; i < (closed ? n : n - 1); i += 1) {
    const a = line[i];
    const b = line[(i + 1) % n];
    if (a && b) best = Math.min(best, segmentDistance(p, a, b));
  }
  return best;
}

/**
 * What a press at canvas point `p` lands on, topmost (last drawn) first: a
 * handle of the selected annotation, then any outline. Geometry only (the SVG
 * overlay takes no pointer events).
 */
export function hitTest(
  annotations: Annotation[],
  selectedId: string | null,
  p: Point,
  mapper: ImageMapper,
  radius: number,
): Hit | null {
  const selected = annotations.find((a) => a.id === selectedId);
  if (selected) {
    const handle = handlesOf(selected).findIndex(
      (h) => canvasDistance(mapper.toCanvas(h), p) <= radius,
    );
    if (handle >= 0) return { id: selected.id, handle };
  }
  for (let i = annotations.length - 1; i >= 0; i -= 1) {
    const a = annotations[i];
    if (!a) continue;
    const outline = outlineOf(a);
    const onCanvas = outline.points.map((q) => mapper.toCanvas(q));
    if (polylineDistance(p, onCanvas, outline.closed) <= radius) return { id: a.id, handle: null };
  }
  return null;
}

export type LabelAnchor = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };

const LABEL_OFFSET = 16;
const LABEL_ROOM = 96;

const anchorFor = (dx: number): LabelAnchor['anchor'] =>
  dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
const unit = (v: Point): Point => {
  const l = len(v);
  return l < 1e-9 ? [0, -1] : [v[0] / l, v[1] / l];
};

/**
 * Where the value label goes, in canvas px: beside the middle of a line (on
 * its upper side), outside the vertex of an angle (away from both arms), at
 * the top-right corner of an area shape (top-left near the right edge).
 */
export function labelAnchor(shape: Shape, mapper: ImageMapper, width: number): LabelAnchor {
  const c = shape.points.map((p) => mapper.toCanvas(p));
  const [a = [0, 0], b = a, d = b] = c;
  if (shape.kind === 'length') {
    const dir = unit(sub(b, a));
    let n: Point = [-dir[1], dir[0]];
    if (n[1] > 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return {
      x: mid[0] + n[0] * LABEL_OFFSET,
      y: mid[1] + n[1] * LABEL_OFFSET + 4,
      anchor: anchorFor(n[0]),
    };
  }
  if (shape.kind === 'angle') {
    const u = unit(sub(a, b));
    const v = unit(sub(d, b));
    const out = unit([-(u[0] + v[0]), -(u[1] + v[1])]);
    return {
      x: b[0] + out[0] * LABEL_OFFSET,
      y: b[1] + out[1] * LABEL_OFFSET + 4 + (out[1] > 0 ? 6 : 0),
      anchor: anchorFor(out[0]),
    };
  }
  const corners = handlesOf(shape).map((p) => mapper.toCanvas(p));
  const xs = corners.map((p) => p[0]);
  const top = Math.min(...corners.map((p) => p[1]));
  const right = Math.max(...xs);
  if (width > 0 && right + 8 + LABEL_ROOM > width) {
    return { x: Math.min(...xs) - 8, y: top + 4, anchor: 'end' };
  }
  return { x: right + 8, y: top + 4, anchor: 'start' };
}

/** Points that make a finished shape for each kind. */
export const POINTS_NEEDED: Record<MeasurementKind, number> = {
  length: 2,
  angle: 3,
  ellipse: 2,
  rectangle: 2,
};
