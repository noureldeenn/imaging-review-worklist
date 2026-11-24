import type { ImageMapper } from '../annotations/annotation-geometry';
import type { Rect, Segment } from './seg-types';

/** Canvas 2D transform [a, b, c, d, e, f]: (x, y) -> (a x + c y + e, b x + d y + f). */
export type Affine = [number, number, number, number, number, number];

/**
 * Image -> canvas (CSS px) as an affine map, derived from the viewport mapper
 * at three points (0,0), (1,0), (0,1). The CPU StackViewport maps image
 * coordinates linearly (zoom, pan, quarter-turn rotations, flips), and pixel
 * (c, r) spans [c, c+1) x [r, r+1), so mask pixel (c, r) drawn at source
 * (c, r) lands exactly on the image pixel.
 */
export function imageToCanvasAffine(mapper: ImageMapper): Affine {
  const [ox, oy] = mapper.toCanvas([0, 0]);
  const [xx, xy] = mapper.toCanvas([1, 0]);
  const [yx, yy] = mapper.toCanvas([0, 1]);
  return [xx - ox, xy - oy, yx - ox, yy - oy, ox, oy];
}

type DrawOptions = { dpr: number; opacity: number; width: number; height: number };

/** Clears the visible canvas and draws the coloured mask through `affine` (no smoothing). */
export function drawMask(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource | null,
  [a, b, c, d, e, f]: Affine,
  { dpr, opacity, width, height }: DrawOptions,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!source) return;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = opacity;
  ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr);
  ctx.drawImage(source, 0, 0);
}

const hex = (color: string, at: number) => parseInt(color.slice(at, at + 2), 16) || 0;

/** RGBA per label 0..8 (label 0 and hidden segments transparent). */
export function buildLut(segments: Segment[]): Uint8Array {
  const lut = new Uint8Array(9 * 4);
  for (const s of segments) {
    if (!s.visible || s.label < 1 || s.label > 8) continue;
    lut.set([hex(s.color, 1), hex(s.color, 3), hex(s.color, 5), 255], s.label * 4);
  }
  return lut;
}

/** The RGBA pixels of `rect` of the mask (row-major, rect-sized). */
export function colorRect(
  mask: Uint8Array,
  width: number,
  { x0, y0, x1, y1 }: Rect,
  lut: Uint8Array,
): Uint8ClampedArray<ArrayBuffer> {
  const w = x1 - x0;
  const rgba = new Uint8ClampedArray(w * (y1 - y0) * 4);
  let o = 0;
  for (let y = y0; y < y1; y += 1) {
    let i = y * width + x0;
    for (let x = x0; x < x1; x += 1, i += 1, o += 4) {
      const l = (mask[i] ?? 0) * 4;
      if (l === 0) continue;
      rgba[o] = lut[l] ?? 0;
      rgba[o + 1] = lut[l + 1] ?? 0;
      rgba[o + 2] = lut[l + 2] ?? 0;
      rgba[o + 3] = lut[l + 3] ?? 0;
    }
  }
  return rgba;
}
