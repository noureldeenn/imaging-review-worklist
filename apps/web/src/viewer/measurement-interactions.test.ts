import { act, waitFor } from '@testing-library/react';
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
import { INTERACTION_LISTENERS, bindViewportInteractions } from './use-viewport-interactions';
import type { AnnotationDrawing } from './annotations/annotation-drawing';
import type { ViewportController } from './viewport-controller';
import { instrumentElement, viewerStats } from './viewer-stats';

// Measurement tools routed through the viewport's ONE bind/unbind.
vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

installViewerHarness();
beforeEach(() => resetAnnotations());

const ENGINE = 1;
const list = (id = 'study-A') => useAnnotationStore.getState().list(id);
const draft = () => useAnnotationStore.getState().draft;

function drawLength(from: [number, number], to: [number, number], id = 1) {
  pointer('pointerdown', ...from, { id });
  pointer('pointermove', ...to, { id });
  pointer('pointerup', ...to, { id });
}

describe('measurement tools in the viewer', () => {
  it('draw in image coordinates through the same handlers (no extra listeners)', async () => {
    instrumentElement(container());
    const hook = await mountReady('study-A');
    expect(viewerStats.elementListeners).toBe(ENGINE + INTERACTION_LISTENERS);
    act(() => hook.result.current.setTool('length'));
    drawLength([20, 20], [60, 50]);
    // Fake camera: canvas = world * 2 (fit scale 2, no pan) and image index == world.
    expect(list()).toMatchObject([
      {
        kind: 'length',
        points: [
          [10, 10],
          [30, 25],
        ],
      },
    ]);
    expect(viewerStats.elementListeners).toBe(ENGINE + INTERACTION_LISTENERS);
    hook.unmount();
    expect(viewerStats.elementListeners).toBe(0);
  });

  it('wheel zoom and middle-drag pan keep working while a measurement tool is active', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('rectangle'));
    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom')).toHaveLength(1);
    const before = callsNamed('setCamera').length;
    pointer('pointerdown', 50, 50, { button: 1 });
    pointer('pointermove', 80, 70);
    pointer('pointerup', 80, 70);
    flushFrames();
    expect(callsNamed('setCamera').length).toBeGreaterThan(before);
    expect(list()).toEqual([]);
  });

  it('a second pointer cancels the drawing and pinches instead', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('length'));
    pointer('pointerdown', 20, 20, { id: 1 });
    pointer('pointermove', 60, 60, { id: 1 });
    pointer('pointerdown', 100, 100, { id: 2 });
    flushFrames();
    expect(draft()).toBeNull();
    pointer('pointermove', 140, 140, { id: 2 });
    pointer('pointerup', 60, 60, { id: 1 });
    pointer('pointerup', 140, 140, { id: 2 });
    flushFrames();
    expect(list()).toEqual([]);
    expect(callsNamed('setZoom').length).toBeGreaterThan(0);
  });

  it('switching tools mid-drawing and Escape cancel; Delete removes the selection', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('angle'));
    pointer('pointerdown', 20, 20);
    pointer('pointerup', 20, 20);
    act(() => hook.result.current.setTool('length'));
    flushFrames();
    expect(draft()).toBeNull();

    pointer('pointerdown', 20, 20);
    pointer('pointermove', 60, 60);
    expect(key('Escape').defaultPrevented).toBe(true);
    pointer('pointerup', 60, 60);
    expect(list()).toEqual([]);

    drawLength([20, 20], [60, 20]);
    pointer('pointerdown', 40, 20); // on the line: selects
    pointer('pointerup', 40, 20);
    expect(key('Delete').defaultPrevented).toBe(true);
    expect(list()).toEqual([]);
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    '%s mid-drawing cancels the drawing',
    async (type) => {
      const hook = await mountReady('study-A');
      act(() => hook.result.current.setTool('rectangle'));
      pointer('pointerdown', 20, 20);
      pointer('pointermove', 80, 80);
      flushFrames();
      expect(draft()).not.toBeNull();
      pointer(type, 80, 80);
      flushFrames();
      expect(draft()).toBeNull();
      pointer('pointerup', 80, 80);
      expect(list()).toEqual([]);
    },
  );

  it('a study switch cancels the drawing; each study keeps its own measurements', async () => {
    const hook = await mountReady('study-A');
    act(() => hook.result.current.setTool('length'));
    drawLength([20, 20], [60, 20]);
    pointer('pointerdown', 20, 40);
    pointer('pointermove', 80, 40);
    flushFrames();
    expect(draft()).not.toBeNull();

    hook.rerender({ id: 'study-B' });
    expect(draft()).toBeNull();
    const b = await resolveStack('study-B');
    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    pointer('pointerup', 80, 40); // the old drawing is gone: nothing is added
    expect(list('study-B')).toEqual([]);
    expect(list('study-A')).toHaveLength(1);
    hook.unmount();
    expect(fake.callsAfterDestroy).toBe(0);
  });
});

describe('bindViewportInteractions with a drawing', () => {
  function drawingSpy(): AnnotationDrawing {
    return {
      pointerDown: vi.fn(() => true),
      pointerMove: vi.fn(() => true),
      hover: vi.fn(),
      pointerUp: vi.fn(() => true),
      keyDown: vi.fn(() => false),
      cancel: vi.fn(),
      dispose: vi.fn(),
    };
  }
  const controller = {
    tool: () => 'length',
    windowLevel: () => null,
  } as unknown as ViewportController;

  it('bind/unbind stay symmetric and unbind cancels an in-progress drawing', () => {
    const el = container();
    instrumentElement(el);
    const d = drawingSpy();
    const unbind = bindViewportInteractions(
      el,
      () => controller,
      () => d,
    );
    expect(viewerStats.elementListeners).toBe(INTERACTION_LISTENERS);
    pointer('pointerdown', 10, 10);
    expect(d.pointerDown).toHaveBeenCalledTimes(1);
    unbind();
    expect(d.cancel).toHaveBeenCalled();
    expect(viewerStats.elementListeners).toBe(0);
    pointer('pointermove', 40, 40);
    pointer('pointerup', 40, 40);
    key('Delete');
    expect(d.pointerMove).not.toHaveBeenCalled();
    expect(d.pointerUp).not.toHaveBeenCalled();
    expect(d.keyDown).not.toHaveBeenCalled();
  });

  it('with the controller gone (disposed load) pointer and key events never reach the drawing', () => {
    const d = drawingSpy();
    let live: ViewportController | null = controller;
    const unbind = bindViewportInteractions(
      container(),
      () => live,
      () => d,
    );
    live = null;
    pointer('pointerdown', 10, 10);
    key('Escape');
    expect(d.pointerDown).not.toHaveBeenCalled();
    expect(d.keyDown).not.toHaveBeenCalled();
    unbind();
  });
});
