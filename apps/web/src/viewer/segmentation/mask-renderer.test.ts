import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageMapper } from '../annotations/annotation-geometry';
import { createDiffRecorder } from './mask-memory';
import { createMaskRenderer } from './mask-renderer';
import { stampDisc } from './seg-math';
import { notifyMask, resetSegmentation, useSegmentStore } from './segment-store';

type Call = [string, ...unknown[]];

function fakeCanvas(clientWidth = 0, clientHeight = 0) {
  const calls: Call[] = [];
  const ctx = new Proxy(
    { imageSmoothingEnabled: true, globalAlpha: 1 },
    {
      get: (target, prop: string) =>
        prop in target
          ? target[prop as keyof typeof target]
          : (...args: unknown[]) => calls.push([prop, ...args]),
    },
  );
  const canvas = { width: 0, height: 0, clientWidth, clientHeight, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls, ctx };
}

let frames: Array<(() => void) | null> = [];
const scheduler = {
  request: (cb: () => void) => frames.push(cb),
  cancel: (h: number) => {
    frames[h - 1] = null;
  },
};
const flush = () => frames.splice(0).forEach((cb) => cb?.());
const zoom2: ImageMapper = { toCanvas: ([x, y]) => [x * 2 + 5, y * 2 + 7], toImage: (p) => p };

beforeEach(() => {
  resetSegmentation();
  frames = [];
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup(getMapper: () => ImageMapper | null = () => zoom2) {
  const visible = fakeCanvas(100, 50);
  const off = fakeCanvas();
  const renderer = createMaskRenderer({
    canvas: visible.canvas,
    studyId: 'A',
    width: 16,
    height: 8,
    getMapper,
    scheduler,
    createCanvas: () => off.canvas,
  });
  return { renderer, visible, off };
}

function paint(x: number, y: number) {
  const target = useSegmentStore.getState().prepareStroke('A', 16, 8);
  if (!target) throw new Error('refused');
  const diff = createDiffRecorder(16 * 8);
  const rect = stampDisc(target.mask, 16, 8, [x, y], 1, target.label, { diff });
  useSegmentStore.getState().commitStroke('A', diff.pack(rect));
  return rect;
}

describe('mask renderer', () => {
  it('sizes the offscreen canvas to the image and draws it through the mapper affine', () => {
    const { visible, off } = setup();
    expect([off.canvas.width, off.canvas.height]).toEqual([16, 8]);
    paint(4.5, 4.5);
    notifyMask('A', null);
    flush();
    expect(visible.canvas.width).toBe(100);
    const draw = visible.calls.filter((c) => c[0] === 'drawImage');
    expect(draw).toEqual([['drawImage', off.canvas, 0, 0]]);
    expect(visible.calls.filter((c) => c[0] === 'setTransform').at(-1)).toEqual([
      'setTransform',
      2,
      0,
      0,
      2,
      5,
      7,
    ]);
    expect(visible.ctx.imageSmoothingEnabled).toBe(false);
    expect(visible.ctx.globalAlpha).toBe(0.5);
  });

  it('recolours only the dirty rectangle while painting, once per frame', () => {
    const { off } = setup();
    flush();
    off.calls.length = 0;
    const rect = paint(4.5, 4.5);
    notifyMask('A', rect);
    notifyMask('A', rect);
    expect(frames.filter(Boolean)).toHaveLength(1);
    flush();
    const puts = off.calls.filter((c) => c[0] === 'putImageData');
    expect(puts).toHaveLength(1);
    const [, image, x, y] = puts[0] ?? [];
    expect([x, y]).toEqual([rect?.x0, rect?.y0]);
    expect((image as ImageData).width).toBe((rect?.x1 ?? 0) - (rect?.x0 ?? 0));
    expect(off.calls.some((c) => c[0] === 'clearRect')).toBe(false);
  });

  it('recolor() repaints the whole mask (colour or visibility change)', () => {
    const { renderer, off } = setup();
    paint(4.5, 4.5);
    flush();
    off.calls.length = 0;
    renderer.recolor();
    flush();
    expect(off.calls.find((c) => c[0] === 'clearRect')).toEqual(['clearRect', 0, 0, 16, 8]);
    const [, image] = off.calls.find((c) => c[0] === 'putImageData') ?? [];
    expect((image as ImageData).width).toBe(16);
  });

  it('with no mapper (load gone) it only clears', () => {
    const { renderer, visible } = setup(() => null);
    paint(4.5, 4.5);
    renderer.project();
    expect(visible.calls.some((c) => c[0] === 'drawImage')).toBe(false);
    expect(visible.calls.some((c) => c[0] === 'clearRect')).toBe(true);
  });

  it('dispose cancels the pending frame, unsubscribes and frees the offscreen canvas', () => {
    const { renderer, off, visible } = setup();
    expect(frames.filter(Boolean)).toHaveLength(1);
    renderer.dispose();
    expect(frames.filter(Boolean)).toHaveLength(0);
    expect([off.canvas.width, off.canvas.height]).toEqual([0, 0]);
    notifyMask('A', null);
    expect(frames.filter(Boolean)).toHaveLength(0);
    renderer.project();
    expect(visible.calls).toEqual([]);
  });
});
