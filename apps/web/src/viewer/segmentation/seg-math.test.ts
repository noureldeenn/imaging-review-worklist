import { describe, expect, it } from 'vitest';
import { createDiffRecorder } from './mask-memory';
import {
  areaOf,
  countLabels,
  formatArea,
  gateValue,
  makeGate,
  stampDisc,
  strokePoints,
  unionRect,
  type PixelSource,
} from './seg-math';

const W = 20;
const H = 10;
const at = (mask: Uint8Array, x: number, y: number) => mask[y * W + x];
const painted = (mask: Uint8Array) => mask.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);

describe('stampDisc', () => {
  it('fills the pixels whose centres lie within r of the point (pixel c spans [c, c+1))', () => {
    const mask = new Uint8Array(W * H);
    const rect = stampDisc(mask, W, H, [5.5, 5.5], 2, 3);
    // Centres within 2 of (5.5, 5.5): a 13-pixel disc.
    expect(painted(mask)).toBe(13);
    expect(at(mask, 5, 5)).toBe(3);
    expect(at(mask, 7, 5)).toBe(3);
    expect(at(mask, 7, 6)).toBe(0);
    expect(rect).toEqual({ x0: 3, y0: 3, x1: 8, y1: 8 });
  });

  it('radius 1 always covers the pixel under the point; radius 100 is clamped to the image', () => {
    const small = new Uint8Array(W * H);
    stampDisc(small, W, H, [0.1, 0.1], 1, 1);
    expect(at(small, 0, 0)).toBe(1);
    expect(painted(small)).toBeLessThanOrEqual(3);
    const big = new Uint8Array(W * H);
    const rect = stampDisc(big, W, H, [10, 5], 100, 2);
    expect(painted(big)).toBe(W * H);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: W, y1: H });
  });

  it('returns null and writes nothing when the disc is entirely outside', () => {
    const mask = new Uint8Array(W * H);
    expect(stampDisc(mask, W, H, [-20, -20], 3, 1)).toBeNull();
    expect(stampDisc(mask, W, H, [50, 5], 3, 1)).toBeNull();
    expect(painted(mask)).toBe(0);
  });

  it('overwrites other labels, erases with 0 and records first old values in the diff', () => {
    const mask = new Uint8Array(W * H);
    stampDisc(mask, W, H, [5.5, 5.5], 1, 1);
    const diff = createDiffRecorder(W * H);
    const oldAt = (i: number) => {
      const p = diff.pack(null);
      return p.old[Array.from(p.indices).indexOf(i)];
    };
    stampDisc(mask, W, H, [5.5, 5.5], 1, 2, { diff });
    expect(at(mask, 5, 5)).toBe(2);
    expect(oldAt(5 * W + 5)).toBe(1);
    stampDisc(mask, W, H, [5.5, 5.5], 1, 0, { diff });
    expect(at(mask, 5, 5)).toBe(0);
    // The diff keeps the value from BEFORE the stroke.
    expect(oldAt(5 * W + 5)).toBe(1);
    expect(diff.size()).toBe(5);
    // Unchanged pixels are not recorded.
    const again = createDiffRecorder(W * H);
    stampDisc(mask, W, H, [5.5, 5.5], 1, 0, { diff: again });
    expect(again.size()).toBe(0);
  });

  it('writes only where the gate allows', () => {
    const mask = new Uint8Array(W * H);
    stampDisc(mask, W, H, [10, 5], 100, 1, { gate: (i) => i % W < 4 });
    expect(painted(mask)).toBe(4 * H);
    expect(at(mask, 3, 0)).toBe(1);
    expect(at(mask, 4, 0)).toBe(0);
  });
});

describe('strokePoints', () => {
  it('interpolates long steps so consecutive stamps overlap (no gaps)', () => {
    const pts = strokePoints([0, 0], [100, 0], 4);
    expect(pts.at(-1)).toEqual([100, 0]);
    let prev = 0;
    for (const [x] of pts) {
      expect(x - prev).toBeLessThanOrEqual(2 + 1e-9);
      prev = x;
    }
    const mask = new Uint8Array(200 * 5);
    stampDisc(mask, 200, 5, [0.5, 2.5], 1, 1);
    for (const p of strokePoints([0.5, 2.5], [150.5, 2.5], 1)) stampDisc(mask, 200, 5, p, 1, 1);
    for (let x = 0; x <= 150; x += 1) expect(mask[2 * 200 + x]).toBe(1);
  });

  it('uses half-pixel steps for radius 1 and returns just the end for a zero move', () => {
    expect(strokePoints([0, 0], [2, 0], 1)).toEqual([
      [0.5, 0],
      [1, 0],
      [1.5, 0],
      [2, 0],
    ]);
    expect(strokePoints([3, 3], [3, 3], 10)).toEqual([[3, 3]]);
  });
});

describe('threshold gate', () => {
  const source = (data: number[], extra: Partial<PixelSource> = {}): PixelSource => ({
    data,
    slope: 1,
    intercept: -1024,
    prescaled: false,
    ...extra,
  });

  it('CT: HU = stored x slope + intercept, inclusive bounds', () => {
    const gate = makeGate(source([834, 994, 995, 1200, 1201]), { min: -190, max: 176 }, 'hu');
    expect([0, 1, 2, 3, 4].map(gate)).toEqual([true, true, true, true, false]);
    expect(gateValue(10, source([], { slope: 2, intercept: 5 }), 'hu')).toBe(25);
  });

  it('CT: pre-scaled pixel data already holds HU (no double rescale)', () => {
    const gate = makeGate(
      source([-190, -30, -29], { prescaled: true }),
      { min: -190, max: -30 },
      'hu',
    );
    expect([0, 1, 2].map(gate)).toEqual([true, true, false]);
  });

  it('non-CT: compares stored values, undoing a pre-applied rescale', () => {
    expect(gateValue(100, source([], { intercept: 50 }), 'stored')).toBe(100);
    expect(gateValue(150, source([], { intercept: 50, prescaled: true }), 'stored')).toBe(100);
    expect(gateValue(21, source([], { slope: 2, intercept: 1, prescaled: true }), 'stored')).toBe(
      10,
    );
    const gate = makeGate(
      source([0, 1000, 4095], { intercept: 0 }),
      { min: 0, max: 1000 },
      'stored',
    );
    expect([0, 1, 2].map(gate)).toEqual([true, true, false]);
  });

  it('reversed bounds still gate the closed interval between them', () => {
    const gate = makeGate(source([5], { intercept: 0 }), { min: 10, max: 0 }, 'stored');
    expect(gate(0)).toBe(true);
  });
});

describe('area', () => {
  it('counts pixels per label', () => {
    const counts = countLabels(Uint8Array.from([0, 1, 1, 2, 8, 8, 8]));
    expect(Array.from(counts)).toEqual([1, 2, 1, 0, 0, 0, 0, 0, 3]);
  });

  it('uses row and column spacing separately (anisotropic) or falls back to px²', () => {
    expect(areaOf(10, { row: 0.5, column: 2 })).toEqual({ value: 10, unit: 'mm²' });
    expect(areaOf(10, { row: 0.25, column: 0.5 })).toEqual({ value: 1.25, unit: 'mm²' });
    expect(areaOf(7, null)).toEqual({ value: 7, unit: 'px²' });
    expect(formatArea({ value: 1234, unit: 'px²' })).toBe('1,234 px²');
    expect(formatArea({ value: 1.25, unit: 'mm²' })).toBe('1.3 mm²');
  });
});

describe('unionRect', () => {
  it('grows to cover both and accepts null', () => {
    const a = { x0: 1, y0: 2, x1: 3, y1: 4 };
    expect(unionRect(null, a)).toEqual(a);
    expect(unionRect(a, { x0: 0, y0: 3, x1: 2, y1: 9 })).toEqual({ x0: 0, y0: 2, x1: 3, y1: 9 });
  });
});
