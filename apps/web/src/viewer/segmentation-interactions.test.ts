import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fake } from '../test/fake-cornerstone';
import {
  callsNamed,
  container,
  flushFrames,
  installViewerHarness,
  key,
  mountReady,
  pointer,
  resolveStack,
  wheel,
} from '../test/viewer-harness';
import { resetAnnotations, useAnnotationStore } from './annotations/annotation-store';
import { getMask, resetSegmentation, useSegmentStore } from './segmentation/segment-store';
import { INTERACTION_LISTENERS } from './use-viewport-interactions';
import { instrumentElement, viewerStats } from './viewer-stats';

// Brush, smart brush and eraser routed through the viewport's ONE bind/unbind.
vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

installViewerHarness();
const SIZE = 64;
beforeEach(() => {
  resetAnnotations();
  resetSegmentation();
  fake.size = { rows: SIZE, columns: SIZE };
  useSegmentStore.getState().setBrushSize(2);
});

const ENGINE = 1;
// Fake camera: canvas = image * 2 (fit scale 2, no pan).
const label = (x: number, y: number, study = 'study-A') => getMask(study)?.mask[y * SIZE + x] ?? 0;
const painted = (study = 'study-A') =>
  getMask(study)?.mask.reduce((n, v) => n + (v ? 1 : 0), 0) ?? 0;

function stroke(from: [number, number], to: [number, number], id = 1) {
  pointer('pointerdown', ...from, { id });
  pointer('pointermove', ...to, { id });
  pointer('pointerup', ...to, { id });
}

describe('segmentation tools in the viewer', () => {
  it('B selects the brush; a drag paints in image pixels with no extra listeners', async () => {
    instrumentElement(container());
    const hook = await mountReady('study-A');
    expect(viewerStats.elementListeners).toBe(ENGINE + INTERACTION_LISTENERS);
    key('b');
    expect(hook.result.current.view.tool).toBe('brush');
    stroke([21, 21], [81, 21]);
    for (let x = 10; x <= 40; x += 1) expect(label(x, 10)).toBe(1);
    expect(label(10, 20)).toBe(0);
    expect(viewerStats.elementListeners).toBe(ENGINE + INTERACTION_LISTENERS);
    hook.unmount();
    expect(viewerStats.elementListeners).toBe(0);
  });

  it('E selects the eraser; Ctrl+Z and Cmd+Z undo the last stroke; plain Z stays the Zoom tool', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('brush'));
    stroke([21, 21], [41, 21]);
    stroke([21, 61], [41, 61]);
    key('e');
    expect(hook.result.current.view.tool).toBe('eraser');
    stroke([21, 21], [41, 21]);
    expect(label(15, 10)).toBe(0);
    const ctrlZ = key('z', false, { ctrlKey: true });
    expect(ctrlZ.defaultPrevented).toBe(true);
    expect(label(15, 10)).toBe(1);
    key('z', false, { metaKey: true });
    expect(label(15, 30)).toBe(0);
    expect(hook.result.current.view.tool).toBe('eraser');
    key('z');
    expect(hook.result.current.view.tool).toBe('zoom');
    expect(label(15, 10)).toBe(1);
  });

  it('Ctrl+Z typed in an input outside the viewport does not undo', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('brush'));
    stroke([21, 21], [41, 21]);
    const input = document.createElement('input');
    document.body.appendChild(input);
    key('z', false, { ctrlKey: true }, input);
    expect(label(15, 10)).toBe(1);
    input.remove();
  });

  it('Escape, a second pointer and a tool switch cancel the stroke and restore the mask', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('brush'));
    stroke([21, 21], [41, 21]);
    const before = painted();
    pointer('pointerdown', 21, 81, { id: 1 });
    pointer('pointermove', 81, 81, { id: 1 });
    expect(painted()).toBeGreaterThan(before);
    key('Escape');
    expect(painted()).toBe(before);
    pointer('pointerup', 81, 81, { id: 1 });
    expect(painted()).toBe(before);

    pointer('pointerdown', 21, 81, { id: 1 });
    pointer('pointermove', 61, 81, { id: 1 });
    pointer('pointerdown', 100, 100, { id: 2 });
    expect(painted()).toBe(before);
    pointer('pointerup', 61, 81, { id: 1 });
    pointer('pointerup', 100, 100, { id: 2 });

    pointer('pointerdown', 21, 81, { id: 1 });
    pointer('pointermove', 61, 81, { id: 1 });
    act(() => hook.result.current.setTool('pan'));
    expect(painted()).toBe(before);
    expect(useSegmentStore.getState().study('study-A').undoDepth).toBe(1);
  });

  it('a study switch or close mid-stroke cancels it; later events are no-ops', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('brush'));
    pointer('pointerdown', 21, 21, { id: 1 });
    pointer('pointermove', 61, 21, { id: 1 });
    hook.rerender({ id: 'study-B' });
    expect(painted()).toBe(0);
    pointer('pointermove', 81, 21, { id: 1 });
    pointer('pointerup', 81, 21, { id: 1 });
    expect(painted()).toBe(0);
    const s = await resolveStack('study-B');
    await act(async () => s.d.resolve('ok'));
    pointer('pointerdown', 21, 21, { id: 3 });
    pointer('pointermove', 41, 21, { id: 3 });
    hook.unmount();
    expect(painted('study-B')).toBe(0);
    pointer('pointerdown', 21, 21, { id: 4 });
    pointer('pointerup', 41, 21, { id: 4 });
    expect(painted('study-B')).toBe(0);
    expect(fake.callsAfterDestroy).toBe(0);
  });

  it('wheel zoom and middle-drag pan keep working with the brush; presses never select measurements', async () => {
    const hook = await mountReady('study-A');
    useAnnotationStore.getState().add('study-A', {
      kind: 'length',
      points: [
        [10, 10],
        [40, 10],
      ],
      spacing: null,
    });
    act(() => hook.result.current.setTool('brush'));
    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom')).toHaveLength(1);
    const panBefore = callsNamed('setCamera').length;
    pointer('pointerdown', 50, 50, { button: 1 });
    pointer('pointermove', 80, 70);
    pointer('pointerup', 80, 70);
    flushFrames();
    expect(callsNamed('setCamera').length).toBeGreaterThan(panBefore);
    // A left press on the measurement's outline paints instead of selecting it.
    const p = useAnnotationStore.getState().list('study-A')[0]?.points[0] ?? [0, 0];
    act(() => hook.result.current.reset());
    stroke([p[0] * 2 + 20, p[1] * 2], [p[0] * 2 + 24, p[1] * 2]);
    expect(useAnnotationStore.getState().selected).toBeNull();
    expect(painted()).toBeGreaterThan(0);
  });

  it('smart brush paints only where the stored value is inside the custom range', async () => {
    // A horizontal gradient: stored value = column * 10 (non-CT: stored values).
    fake.image = {
      getPixelData: () => Array.from({ length: SIZE * SIZE }, (_, i) => (i % SIZE) * 10),
      slope: 1,
      intercept: 0,
    };
    const hook = await mountReady('study-A');
    useSegmentStore.getState().setCustom({ min: 0, max: 150 });
    act(() => hook.result.current.setTool('smartBrush'));
    stroke([1, 21], [101, 21]);
    expect(label(15, 10)).toBe(1);
    expect(label(16, 10)).toBe(0);
    expect(label(40, 10)).toBe(0);
  });
});
