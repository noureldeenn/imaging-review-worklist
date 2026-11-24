import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMaskMemory, packDiff } from './mask-memory';
import { stampDisc } from './seg-math';
import {
  DROPPED_NOTICE,
  MAX_SEGMENTS,
  MAX_UNDO_STROKES,
  SEGMENT_LIMIT_NOTICE,
  TOO_LARGE_NOTICE,
} from './seg-types';
import {
  getMask,
  resetSegmentation,
  segmentAreas,
  statusFor,
  subscribeMask,
  useSegmentStore,
} from './segment-store';

const W = 16;
const H = 16;
const store = () => useSegmentStore.getState();
const study = (id = 'A') => store().study(id);

/** One brush stroke as the painting machine does it: prepare, stamp, commit. */
function paint(studyId: string, centre: [number, number], radius = 2, erase = false) {
  const target = store().prepareStroke(studyId, W, H, erase);
  if (!target) return null;
  const diff = new Map<number, number>();
  const rect = stampDisc(target.mask, W, H, centre, radius, erase ? 0 : target.label, { diff });
  store().commitStroke(studyId, diff, rect);
  return target;
}
const labelAt = (studyId: string, x: number, y: number) => getMask(studyId)?.mask[y * W + x];

beforeEach(() => resetSegmentation());

describe('segment store', () => {
  it('first paint auto-creates Segment 1 (active, first palette colour) and its mask', () => {
    expect(study().segments).toEqual([]);
    paint('A', [4.5, 4.5]);
    const [s] = study().segments;
    expect(s).toMatchObject({ name: 'Segment 1', label: 1, visible: true, color: '#ef4444' });
    expect(study().activeId).toBe(s?.id);
    expect(labelAt('A', 4, 4)).toBe(1);
    expect(study().undoDepth).toBe(1);
  });

  it('painting segment 2 overwrites segment 1 (one label per pixel); the eraser clears any label', () => {
    paint('A', [4.5, 4.5]);
    const second = store().addSegment('A');
    expect(second?.name).toBe('Segment 2');
    expect(study().activeId).toBe(second?.id);
    paint('A', [4.5, 4.5], 1);
    expect(labelAt('A', 4, 4)).toBe(2);
    expect(labelAt('A', 6, 4)).toBe(1);
    paint('A', [4.5, 4.5], 3, true);
    expect(labelAt('A', 4, 4)).toBe(0);
    expect(labelAt('A', 6, 4)).toBe(0);
  });

  it('undo reverts the last stroke only, and notifies the overlay', () => {
    const seen = vi.fn();
    const off = subscribeMask('A', seen);
    paint('A', [4.5, 4.5], 1);
    paint('A', [10.5, 10.5], 1);
    expect(store().undo('A')).toBe(true);
    expect(labelAt('A', 10, 10)).toBe(0);
    expect(labelAt('A', 4, 4)).toBe(1);
    expect(seen).toHaveBeenCalled();
    expect(store().undo('A')).toBe(true);
    expect(labelAt('A', 4, 4)).toBe(0);
    expect(store().undo('A')).toBe(false);
    expect(study().undoDepth).toBe(0);
    off();
  });

  it(`keeps at most ${MAX_UNDO_STROKES} strokes of undo`, () => {
    for (let k = 0; k < MAX_UNDO_STROKES + 5; k += 1) paint('A', [4.5, 4.5], 1, k % 2 === 1);
    expect(study().undoDepth).toBe(MAX_UNDO_STROKES);
    let n = 0;
    while (store().undo('A')) n += 1;
    expect(n).toBe(MAX_UNDO_STROKES);
  });

  it('clear removes the segments, the paint and the undo history, and announces it', () => {
    paint('A', [4.5, 4.5]);
    store().clear('A');
    expect(study().segments).toEqual([]);
    expect(getMask('A')).toBeUndefined();
    expect(study().undoDepth).toBe(0);
    expect(store().announcement.text).toBe('Segments cleared');
    paint('A', [4.5, 4.5]);
    expect(study().segments[0]?.name).toBe('Segment 1');
  });

  it('deleting a segment erases its pixels and keeps the others', () => {
    const one = paint('A', [4.5, 4.5], 1);
    store().addSegment('A');
    paint('A', [10.5, 10.5], 1);
    const firstId = study().segments[0]?.id ?? '';
    store().removeSegment('A', firstId);
    expect(study().segments.map((s) => s.name)).toEqual(['Segment 2']);
    expect(labelAt('A', 4, 4)).toBe(0);
    expect(labelAt('A', 10, 10)).toBe(2);
    expect(one?.label).toBe(1);
    // The freed label is reused, the name keeps counting.
    expect(store().addSegment('A')).toMatchObject({ label: 1, name: 'Segment 3' });
  });

  it('rename, active and visibility are per segment', () => {
    const s = store().addSegment('A');
    const t = store().addSegment('A');
    store().renameSegment('A', s?.id ?? '', 'Liver ROI');
    store().setActive('A', s?.id ?? '');
    store().toggleVisible('A', t?.id ?? '');
    expect(study().segments.map((x) => [x.name, x.visible])).toEqual([
      ['Liver ROI', true],
      ['Segment 2', false],
    ]);
    expect(study().activeId).toBe(s?.id);
  });

  it(`refuses a ${MAX_SEGMENTS + 1}th segment with a visible message`, () => {
    for (let k = 0; k < MAX_SEGMENTS; k += 1) expect(store().addSegment('A')).not.toBeNull();
    expect(store().addSegment('A')).toBeNull();
    expect(study().segments).toHaveLength(MAX_SEGMENTS);
    expect(statusFor(store(), 'A')).toBe(SEGMENT_LIMIT_NOTICE);
  });

  it('refuses a mask above 16,777,216 pixels without throwing', () => {
    expect(store().prepareStroke('A', 4097, 4096)).toBeNull();
    expect(statusFor(store(), 'A')).toBe(TOO_LARGE_NOTICE);
    expect(study().segments).toEqual([]);
    expect(store().prepareStroke('A', 4096, 4096)).not.toBeNull();
  });

  it('keeps each study separate (A -> B -> A)', () => {
    paint('A', [4.5, 4.5]);
    paint('B', [12.5, 12.5]);
    store().addSegment('B');
    expect(study('A').segments).toHaveLength(1);
    expect(study('B').segments).toHaveLength(2);
    expect(labelAt('A', 12, 12)).toBe(0);
    expect(labelAt('B', 4, 4)).toBe(0);
    expect(labelAt('A', 4, 4)).toBe(1);
    expect(store().undo('B')).toBe(true);
    expect(labelAt('A', 4, 4)).toBe(1);
  });

  it('counts each segment’s pixels for the area readout', () => {
    paint('A', [4.5, 4.5], 1);
    expect(segmentAreas('A').get(1)).toBe(5);
    expect(segmentAreas('missing').size).toBe(0);
  });
});

describe('memory budget', () => {
  it('drops the least recently used study and tells the user in that study', () => {
    resetSegmentation(W * H * 2 + 200);
    paint('A', [1, 1], 1);
    paint('B', [1, 1], 1);
    paint('A', [3, 3], 1); // A is now the most recently used
    paint('C', [1, 1], 1);
    expect(getMask('B')).toBeUndefined();
    expect(getMask('A')).toBeDefined();
    expect(study('B').segments).toEqual([]);
    expect(study('B').dropped).toBe(true);
    expect(statusFor(store(), 'B')).toBe(DROPPED_NOTICE);
    expect(statusFor(store(), 'A')).toBe('');
    // Painting B again starts afresh and clears the notice.
    paint('B', [1, 1], 1);
    expect(study('B').dropped).toBe(false);
  });

  it('mask memory: undo diffs count towards the budget; a lone study sheds old undo', () => {
    const memory = createMaskMemory(100 + 5 * 3);
    const r = memory.ensure('A', 10, 10);
    expect('entry' in r).toBe(true);
    for (let k = 0; k < 3; k += 1) memory.pushUndo('A', packDiff(new Map([[k, 0]]), null));
    expect(memory.totalBytes()).toBe(115);
    memory.pushUndo('A', packDiff(new Map([[9, 0]]), null));
    expect(memory.totalBytes()).toBeLessThanOrEqual(115);
    expect(memory.get('A')?.undo).toHaveLength(3);
  });
});
