import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageMapper } from '../annotations/annotation-geometry';
import { createDiffRecorder } from './mask-memory';
import { createSegPainting } from './seg-painting';
import { stampDisc } from './seg-math';
import { getMask, resetSegmentation, subscribeMask, useSegmentStore } from './segment-store';

const store = () => useSegmentStore.getState();
const identity: ImageMapper = { toCanvas: (p) => p, toImage: (p) => p };
const W = 40;
const H = 20;
let frames: Array<(() => void) | null> = [];
const scheduler = {
  request: (cb: () => void) => frames.push(cb),
  cancel: (h: number) => {
    frames[h - 1] = null;
  },
};
const painting = () =>
  createSegPainting({
    studyId: 'A',
    imageSize: { width: W, height: H },
    mapper: identity,
    getPixels: () => null,
    gateMode: 'stored',
    scheduler,
  });
const count = (label: number) =>
  getMask('A')?.mask.reduce((n, v) => n + (v === label ? 1 : 0), 0) ?? 0;

beforeEach(() => {
  resetSegmentation();
  frames = [];
  store().setBrushSize(3);
});

describe('rename does not touch the mask', () => {
  it('a name change neither notifies the overlay nor bumps the mask revision', () => {
    const s = store().addSegment('A');
    const seen = vi.fn();
    subscribeMask('A', seen);
    const revision = store().study('A').revision;
    store().renameSegment('A', s?.id ?? '', 'Liver');
    expect(seen).not.toHaveBeenCalled();
    expect(store().study('A').revision).toBe(revision);
    store().toggleVisible('A', s?.id ?? '');
    expect(seen).toHaveBeenCalledWith(null);
  });
});

describe('delete or clear during a stroke', () => {
  it('deleting the active segment mid-stroke cancels the stroke and leaves none of its label', () => {
    const p = painting();
    p.pointerDown({ id: 1, point: [5.5, 5.5], tool: 'brush', touch: false });
    p.pointerUp(1, [5.5, 5.5]);
    const second = store().addSegment('A');
    p.pointerDown({ id: 1, point: [20.5, 10.5], tool: 'brush', touch: false });
    p.pointerMove(1, [30.5, 10.5]);
    expect(count(2)).toBeGreaterThan(0);
    store().removeSegment('A', second?.id ?? '');
    expect(count(2)).toBe(0);
    // Later moves and the release of the cancelled stroke paint nothing.
    p.pointerMove(1, [35.5, 10.5]);
    p.pointerUp(1, [35.5, 10.5]);
    expect(count(2)).toBe(0);
    expect(count(1)).toBeGreaterThan(0);
    expect(store().study('A').undoDepth).toBe(0);
  });

  it('clear mid-stroke cancels the stroke; the release paints nothing', () => {
    const p = painting();
    p.pointerDown({ id: 1, point: [5.5, 5.5], tool: 'brush', touch: false });
    p.pointerMove(1, [15.5, 5.5]);
    store().clear('A');
    // The stroke was cancelled: its pointer no longer belongs to the painting.
    expect(p.pointerMove(1, [25.5, 5.5])).toBe(false);
    expect(p.pointerUp(1, [25.5, 5.5])).toBe(false);
    expect(getMask('A')).toBeUndefined();
    expect(store().study('A').segments).toEqual([]);
  });
});

describe('stroke diffs at full image size', () => {
  it('records a stroke over most of a 4096 x 4096 mask without throwing and restores it', () => {
    const size = 4096;
    const mask = new Uint8Array(size * size);
    const diff = createDiffRecorder(mask.length);
    expect(() => stampDisc(mask, size, size, [2048, 2048], 2600, 1, { diff })).not.toThrow();
    expect(diff.size()).toBeGreaterThan(16_000_000);
    // First write wins: a second stamp over the same pixels records nothing new.
    const before = diff.size();
    stampDisc(mask, size, size, [2048, 2048], 10, 2, { diff });
    expect(diff.size()).toBe(before);
    diff.restore(mask);
    expect(mask.every((v) => v === 0)).toBe(true);
    const packed = diff.pack(null);
    expect(packed.indices.length).toBe(before);
    expect(packed.old.every((v) => v === 0)).toBe(true);
  });
});
