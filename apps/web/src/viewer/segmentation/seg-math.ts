import type { Point, Spacing } from '../annotations/measure-math';
import type { Range, Rect } from './seg-types';

/**
 * Pure segmentation math on a label mask (one byte per image pixel, index
 * row * columns + column). Image coordinates follow the CPU StackViewport:
 * pixel (c, r) spans [c, c+1) x [r, r+1), so its centre is (c + 0.5, r + 0.5).
 */

/** Pixel values of the loaded image (greyscale, one sample per pixel). */
export type PixelSource = {
  data: ArrayLike<number>;
  slope: number;
  intercept: number;
  /** True when the loader already applied slope/intercept to `data`. */
  prescaled: boolean;
};

/** 'hu' = modality values (stored x slope + intercept); 'stored' = raw stored values. */
export type GateMode = 'hu' | 'stored';

type StampOptions = {
  /** Only pixels whose index passes are written (smart brush). */
  gate?: (index: number) => boolean;
  /** Records each changed pixel's value from before the stroke (first write wins). */
  diff?: Map<number, number>;
};

/**
 * Writes `value` into every pixel whose centre lies within `radius` image
 * pixels of `centre` (radius >= 1 always includes the pixel under the point),
 * clamped to the image. Returns the touched rectangle, or null if none.
 */
export function stampDisc(
  mask: Uint8Array,
  width: number,
  height: number,
  [x, y]: Point,
  radius: number,
  value: number,
  { gate, diff }: StampOptions = {},
): Rect | null {
  // Columns whose centre c + 0.5 lies within [x - r, x + r] (same for rows).
  const x0 = Math.max(0, Math.ceil(x - radius - 0.5));
  const y0 = Math.max(0, Math.ceil(y - radius - 0.5));
  const x1 = Math.min(width, Math.floor(x + radius - 0.5) + 1);
  const y1 = Math.min(height, Math.floor(y + radius - 0.5) + 1);
  if (x0 >= x1 || y0 >= y1) return null;
  const r2 = radius * radius;
  for (let row = y0; row < y1; row += 1) {
    const dy = row + 0.5 - y;
    for (let col = x0; col < x1; col += 1) {
      const dx = col + 0.5 - x;
      if (dx * dx + dy * dy > r2) continue;
      const i = row * width + col;
      const old = mask[i] ?? 0;
      if (old === value || (gate && !gate(i))) continue;
      if (diff && !diff.has(i)) diff.set(i, old);
      mask[i] = value;
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Stamp centres from `from` (exclusive, already stamped) to `to` (inclusive),
 * at most radius / 2 apart (half a pixel for small brushes), so a fast drag
 * leaves no gaps between pointer samples.
 */
export function strokePoints(from: Point, to: Point, radius: number): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const step = Math.max(0.5, radius / 2);
  const n = Math.ceil(length / step);
  if (n <= 1) return [to];
  const points: Point[] = [];
  for (let k = 1; k <= n; k += 1) points.push([from[0] + (dx * k) / n, from[1] + (dy * k) / n]);
  return points;
}

/** Value the gate compares for a raw sample of `source`. */
export function gateValue(raw: number, source: PixelSource, mode: GateMode): number {
  const { slope, intercept, prescaled } = source;
  if (mode === 'hu') return prescaled ? raw : raw * slope + intercept;
  return prescaled ? (raw - intercept) / (slope || 1) : raw;
}

/** Index predicate: true where the pixel's value lies in the closed range. */
export function makeGate(source: PixelSource, range: Range, mode: GateMode) {
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  return (index: number): boolean => {
    const raw = source.data[index];
    if (raw === undefined) return false;
    const v = gateValue(raw, source, mode);
    return v >= lo && v <= hi;
  };
}

/** Pixel count per label value 0..8. */
export function countLabels(mask: Uint8Array): Uint32Array {
  const counts = new Uint32Array(9);
  for (let i = 0; i < mask.length; i += 1) {
    const v = mask[i] ?? 0;
    if (v < 9) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export type Area = { value: number; unit: 'mm²' | 'px²' };

/** Area of `pixels` image pixels: mm² with Pixel Spacing (row x column), else px². */
export function areaOf(pixels: number, spacing: Spacing | null): Area {
  if (!spacing) return { value: pixels, unit: 'px²' };
  return { value: pixels * spacing.row * spacing.column, unit: 'mm²' };
}

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatArea({ value, unit }: Area): string {
  const fmt = unit === 'mm²' && value < 100 ? ONE_DECIMAL : WHOLE;
  return `${fmt.format(value)} ${unit}`;
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}
