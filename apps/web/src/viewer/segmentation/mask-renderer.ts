import type { ImageMapper } from '../annotations/annotation-geometry';
import {
  buildLut,
  colorRect,
  drawMask,
  imageToCanvasAffine,
  type Affine,
} from './overlay-projection';
import { unionRect } from './seg-math';
import type { Rect } from './seg-types';
import { getMask, subscribeMask, useSegmentStore } from './segment-store';

type Scheduler = { request(cb: () => void): number; cancel(handle: number): void };

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Pixels coloured per putImageData call on a full repaint (bounds the temporary buffer). */
const BAND_PIXELS = 1 << 20;

type Options = {
  canvas: HTMLCanvasElement;
  studyId: string;
  width: number;
  height: number;
  /** Guarded getter: null once the load is gone (never a destroyed viewport). */
  getMapper(): ImageMapper | null;
  scheduler?: Scheduler;
  /** Offscreen canvas factory (tests). */
  createCanvas?(): HTMLCanvasElement;
};

export type MaskRenderer = {
  /** Segment colours or visibility changed: recolour everything (next frame). */
  recolor(): void;
  /** Camera, size or opacity changed: redraw now through the current affine. */
  project(): void;
  dispose(): void;
};

/**
 * Draws ONE study's label mask on the overlay canvas. The mask is coloured into
 * an offscreen image-sized canvas, only the changed rectangle per frame while
 * painting (dirty rects from `notifyMask`), then drawn to the visible canvas
 * with the image -> canvas affine of the current camera, unsmoothed, at the
 * panel's opacity. `dispose()` cancels a pending frame, unsubscribes and frees
 * the offscreen backing store (width/height 0).
 */
export function createMaskRenderer({
  canvas,
  studyId,
  width,
  height,
  getMapper,
  scheduler = browserScheduler,
  createCanvas = () => document.createElement('canvas'),
}: Options): MaskRenderer {
  let off: HTMLCanvasElement | null = createCanvas();
  off.width = width;
  off.height = height;
  let full = true;
  let dirty: Rect | null = null;
  let frame: number | null = null;
  let disposed = false;
  let lut = buildLut(useSegmentStore.getState().study(studyId).segments);

  const recolor = (mask: Uint8Array, ctx: CanvasRenderingContext2D, rect: Rect) => {
    const band = Math.max(1, Math.floor(BAND_PIXELS / Math.max(1, rect.x1 - rect.x0)));
    for (let y = rect.y0; y < rect.y1; y += band) {
      const part = { ...rect, y0: y, y1: Math.min(rect.y1, y + band) };
      const rgba = colorRect(mask, width, part, lut);
      ctx.putImageData(new ImageData(rgba, part.x1 - part.x0, part.y1 - part.y0), part.x0, part.y0);
    }
  };

  const paint = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    if (disposed) return;
    const entry = getMask(studyId);
    const usable = entry !== undefined && entry.width === width && entry.height === height;
    const octx = off?.getContext('2d');
    if (octx && (full || dirty)) {
      if (full) octx.clearRect(0, 0, width, height);
      const rect = full ? { x0: 0, y0: 0, x1: width, y1: height } : dirty;
      if (usable && rect) recolor(entry.mask, octx, rect);
    }
    full = false;
    dirty = null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const mapper = getMapper();
    const affine: Affine = mapper ? imageToCanvasAffine(mapper) : [1, 0, 0, 1, 0, 0];
    drawMask(ctx, usable && mapper ? off : null, affine, {
      dpr,
      opacity: useSegmentStore.getState().opacity / 100,
      width: cw,
      height: ch,
    });
  };
  const schedule = () => {
    if (!disposed) frame ??= scheduler.request(paint);
  };
  const unsubscribe = subscribeMask(studyId, (rect) => {
    if (rect) dirty = unionRect(dirty, rect);
    else full = true;
    schedule();
  });
  schedule();

  return {
    recolor() {
      lut = buildLut(useSegmentStore.getState().study(studyId).segments);
      full = true;
      schedule();
    },
    project: paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (frame !== null) scheduler.cancel(frame);
      frame = null;
      if (off) {
        off.width = 0;
        off.height = 0;
      }
      off = null;
    },
  };
}
