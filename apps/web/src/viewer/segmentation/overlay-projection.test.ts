import { describe, expect, it, vi } from 'vitest';
import type { ImageMapper } from '../annotations/annotation-geometry';
import type { Point } from '../annotations/measure-math';
import {
  buildLut,
  colorRect,
  drawMask,
  imageToCanvasAffine,
  type Affine,
} from './overlay-projection';
import type { Segment } from './seg-types';

/** A mapper for scale s, rotation (quarter turns cw), optional flip of the image x axis, then pan. */
function mapper(s: number, quarter: number, flipX: boolean, pan: Point): ImageMapper {
  const toCanvas = ([x0, y]: Point): Point => {
    const x = flipX ? -x0 : x0;
    const r: Point[] = [
      [x, y],
      [-y, x],
      [-x, -y],
      [y, -x],
    ];
    const [rx, ry] = r[quarter % 4] ?? [x, y];
    return [rx * s + pan[0], ry * s + pan[1]];
  };
  return { toCanvas, toImage: (p) => p };
}
const apply = ([a, b, c, d, e, f]: Affine, [x, y]: Point): Point => [
  a * x + c * y + e,
  b * x + d * y + f,
];

describe('imageToCanvasAffine', () => {
  const cases: Array<[string, ImageMapper]> = [
    ['identity', mapper(1, 0, false, [0, 0])],
    ['zoom', mapper(2.5, 0, false, [0, 0])],
    ['pan', mapper(1, 0, false, [40, -12])],
    ['rotate 90', mapper(3, 1, false, [100, 0])],
    ['rotate 180', mapper(3, 2, false, [100, 80])],
    ['rotate 270', mapper(3, 3, false, [0, 80])],
    ['flip H', mapper(2, 0, true, [256, 0])],
    ['flip + rotate', mapper(2, 1, true, [30, 30])],
  ];
  for (const [name, m] of cases) {
    it(`matches the mapper at any image point: ${name}`, () => {
      const affine = imageToCanvasAffine(m);
      for (const p of [
        [0, 0],
        [17, 3],
        [255, 255],
        [-4, 120.5],
      ] as Point[]) {
        const [x, y] = apply(affine, p);
        const [ex, ey] = m.toCanvas(p);
        expect(x).toBeCloseTo(ex, 9);
        expect(y).toBeCloseTo(ey, 9);
      }
    });
  }
});

describe('drawMask', () => {
  it('clears, then draws the mask once through the affine scaled to device pixels, unsmoothed', () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      globalAlpha: 1,
    };
    const source = { width: 4, height: 4 } as unknown as CanvasImageSource;
    drawMask(ctx as unknown as CanvasRenderingContext2D, source, [2, 0, 0, 2, 10, 20], {
      dpr: 1.5,
      opacity: 0.5,
      width: 300,
      height: 200,
    });
    expect(ctx.setTransform.mock.calls).toEqual([
      [1, 0, 0, 1, 0, 0],
      [3, 0, 0, 3, 15, 30],
    ]);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 300, 200);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it('with no source only clears', () => {
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() };
    drawMask(ctx as unknown as CanvasRenderingContext2D, null, [1, 0, 0, 1, 0, 0], {
      dpr: 1,
      opacity: 1,
      width: 10,
      height: 10,
    });
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});

describe('colours', () => {
  const seg = (label: number, color: string, visible = true): Segment => ({
    id: `s${label}`,
    label,
    name: `Segment ${label}`,
    color,
    visible,
  });

  it('builds an RGBA lookup per label; hidden segments are transparent', () => {
    const lut = buildLut([seg(1, '#ff0000'), seg(2, '#00ff00', false), seg(3, '#3b82f6')]);
    expect(Array.from(lut.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(lut.slice(4, 8))).toEqual([255, 0, 0, 255]);
    expect(Array.from(lut.slice(8, 12))).toEqual([0, 0, 0, 0]);
    expect(Array.from(lut.slice(12, 16))).toEqual([59, 130, 246, 255]);
  });

  it('colours one rectangle of the mask into an RGBA buffer of that rectangle', () => {
    const lut = buildLut([seg(1, '#ff0000')]);
    const mask = Uint8Array.from([0, 1, 0, 0, 1, 1]); // 3 x 2
    const rgba = colorRect(mask, 3, { x0: 1, y0: 0, x1: 3, y1: 2 }, lut);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255]);
  });
});
