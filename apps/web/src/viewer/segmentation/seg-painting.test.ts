import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageMapper } from '../annotations/annotation-geometry';
import { createSegPainting, type SegPainting } from './seg-painting';
import { COLOR_IMAGE_NOTICE } from './seg-types';
import {
  getMask,
  resetSegmentation,
  statusFor,
  subscribeMask,
  useSegmentStore,
} from './segment-store';

const W = 40;
const H = 20;
// Canvas == image coordinates in these tests.
const identity: ImageMapper = { toCanvas: (p) => p, toImage: (p) => p };
// Stored value = column * 10 (a horizontal gradient), CT-style rescale -1000.
const gradient = Array.from({ length: W * H }, (_, i) => (i % W) * 10);

let frames: Array<(() => void) | null> = [];
const scheduler = {
  request: (cb: () => void) => frames.push(cb),
  cancel: (h: number) => {
    frames[h - 1] = null;
  },
};
const flush = () => frames.splice(0).forEach((cb) => cb?.());
const store = () => useSegmentStore.getState();
const at = (x: number, y: number) => getMask('A')?.mask[y * W + x] ?? 0;
const painted = () => getMask('A')?.mask.reduce((n, v) => n + (v ? 1 : 0), 0) ?? 0;

function make(overrides: Partial<Parameters<typeof createSegPainting>[0]> = {}): SegPainting {
  return createSegPainting({
    studyId: 'A',
    imageSize: { width: W, height: H },
    mapper: identity,
    getPixels: () => ({ data: gradient, slope: 1, intercept: -1000, prescaled: false }),
    gateMode: 'hu',
    scheduler,
    ...overrides,
  });
}
const down = (p: SegPainting, x: number, y: number, tool = 'brush', id = 1) =>
  p.pointerDown({ id, point: [x, y], tool, touch: false });

beforeEach(() => {
  resetSegmentation();
  frames = [];
  store().setBrushSize(2);
});

describe('segmentation painting', () => {
  it('ignores non-segmentation tools so measurements and navigation keep their presses', () => {
    const p = make();
    expect(down(p, 5, 5, 'length')).toBe(false);
    expect(down(p, 5, 5, 'windowLevel')).toBe(false);
    expect(getMask('A')).toBeUndefined();
  });

  it('brush: one stroke from press to release, interpolated, one undo step', () => {
    const p = make();
    expect(down(p, 2.5, 5.5)).toBe(true);
    expect(p.pointerMove(1, [30.5, 5.5])).toBe(true);
    expect(p.pointerUp(1, [30.5, 5.5])).toBe(true);
    for (let x = 2; x <= 30; x += 1) expect(at(x, 5)).toBe(1);
    expect(store().study('A').undoDepth).toBe(1);
    expect(store().study('A').segments[0]?.name).toBe('Segment 1');
  });

  it('notifies the overlay at most once per animation frame with the dirty rectangle', () => {
    const rects: unknown[] = [];
    subscribeMask('A', (r) => rects.push(r));
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerMove(1, [6.5, 5.5]);
    p.pointerMove(1, [7.5, 5.5]);
    expect(rects).toHaveLength(0);
    expect(frames).toHaveLength(1);
    flush();
    expect(rects).toEqual([{ x0: 3, y0: 3, x1: 10, y1: 8 }]);
  });

  it('smart brush paints only pixels whose HU lies in the range', () => {
    store().setPreset('custom');
    store().setCustom({ min: -1000, max: -900 }); // columns 0..10
    const p = make();
    down(p, 1.5, 5.5, 'smartBrush');
    p.pointerMove(1, [30.5, 5.5]);
    p.pointerUp(1, [30.5, 5.5]);
    expect(at(5, 5)).toBe(1);
    expect(at(10, 5)).toBe(1);
    expect(at(11, 5)).toBe(0);
    expect(at(25, 5)).toBe(0);
  });

  it('smart brush on a non-CT image gates stored values; presets fall back to Custom', () => {
    store().setPreset('bone');
    store().setCustom({ min: 0, max: 50 });
    const p = make({ gateMode: 'stored' });
    down(p, 1.5, 5.5, 'smartBrush');
    p.pointerUp(1, [20.5, 5.5]);
    expect(at(5, 5)).toBe(1);
    expect(at(6, 5)).toBe(0);
  });

  it('smart brush refuses a colour image with a message', () => {
    const p = make({ getPixels: () => null });
    expect(down(p, 5, 5, 'smartBrush')).toBe(true);
    expect(painted()).toBe(0);
    expect(statusFor(store(), 'A')).toBe(COLOR_IMAGE_NOTICE);
  });

  it('eraser clears any label inside its disc', () => {
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerUp(1, [5.5, 5.5]);
    store().addSegment('A');
    down(p, 9.5, 5.5);
    p.pointerUp(1, [9.5, 5.5]);
    expect(at(9, 5)).toBe(2);
    down(p, 7.5, 5.5, 'eraser');
    p.pointerUp(1, [7.5, 5.5]);
    expect(at(6, 5)).toBe(0);
    expect(at(8, 5)).toBe(0);
    expect(at(4, 5)).toBe(1);
  });

  it('Escape, cancel (second pointer / tool switch) and dispose restore the mask', () => {
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerUp(1, [5.5, 5.5]);
    const before = painted();
    down(p, 20.5, 5.5);
    p.pointerMove(1, [30.5, 5.5]);
    expect(p.keyDown('Escape')).toBe(true);
    expect(painted()).toBe(before);
    expect(p.pointerUp(1, [30.5, 5.5])).toBe(false);
    down(p, 20.5, 10.5, 'eraser');
    down(p, 20.5, 10.5);
    p.pointerMove(1, [25.5, 10.5]);
    p.cancel();
    expect(painted()).toBe(before);
    down(p, 20.5, 10.5);
    p.dispose();
    expect(painted()).toBe(before);
    expect(store().study('A').undoDepth).toBe(1);
  });

  it('a pending frame is cancelled and every event after dispose is a no-op', () => {
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerMove(1, [8.5, 5.5]);
    p.dispose();
    expect(frames.every((f) => f === null)).toBe(true);
    expect(down(p, 5.5, 5.5)).toBe(false);
    expect(p.pointerMove(1, [9, 9])).toBe(false);
    expect(p.pointerUp(1, [9, 9])).toBe(false);
    expect(p.keyDown('Escape')).toBe(false);
    expect(p.undo()).toBe(false);
    expect(painted()).toBe(0);
  });

  it('undo during a stroke cancels it; otherwise it reverts the last stroke', () => {
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerUp(1, [5.5, 5.5]);
    down(p, 15.5, 5.5);
    expect(p.undo()).toBe(true);
    expect(at(15, 5)).toBe(0);
    expect(at(5, 5)).toBe(1);
    expect(p.undo()).toBe(true);
    expect(painted()).toBe(0);
  });

  it('uses the brush size from the panel (radius in image pixels)', () => {
    store().setBrushSize(1);
    const p = make();
    down(p, 5.5, 5.5);
    p.pointerUp(1, [5.5, 5.5]);
    expect(painted()).toBe(5);
  });
});
