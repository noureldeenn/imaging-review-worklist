import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fake } from '../test/fake-cornerstone';
import { useDicomViewer } from './use-dicom-viewer';
import { INTERACTION_LISTENERS } from './use-viewport-interactions';
import { DEFAULT_VIEW } from './viewport-controller';
import { viewerStats } from './viewer-stats';

// Same approach as use-dicom-viewer.test.ts, with a fake viewport that also
// implements the camera API (see ../test/fake-cornerstone.ts).
vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;

function mountViewer(initial: string | null) {
  return renderHook(
    ({ id }: { id: string | null }) => {
      const v = useDicomViewer(id);
      v.containerRef.current = container;
      return v;
    },
    { initialProps: { id: initial } },
  );
}

async function resolveStack(study: string) {
  await waitFor(() => expect(fake.stacks.find((s) => s.imageId.includes(study))).toBeDefined());
  const s = fake.stacks.find((x) => x.imageId.includes(study));
  if (!s) throw new Error('no stack');
  return s;
}

async function mountReady(study = 'study-A') {
  const hook = mountViewer(study);
  const s = await resolveStack(study);
  await act(async () => s.d.resolve('ok'));
  await waitFor(() => expect(hook.result.current.state).toBe('ready'));
  return hook;
}

function pointer(type: string, x: number, y: number, init: { id?: number; button?: number } = {}) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: init.button ?? 0,
  });
  Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  act(() => {
    container.dispatchEvent(e);
  });
  return e;
}

function key(k: string, shiftKey = false) {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    container.dispatchEvent(e);
  });
  return e;
}

function wheel(deltaY: number) {
  const e = new WheelEvent('wheel', { deltaY, clientX: 10, clientY: 10, cancelable: true });
  act(() => {
    container.dispatchEvent(e);
  });
  return e;
}

function flushFrames() {
  act(() => {
    const queued = fake.frames.splice(0);
    queued.forEach((cb) => cb());
  });
}

const callsNamed = (name: string, engine?: number) =>
  fake.calls.filter((c) => c.name === name && (engine === undefined || c.engine === engine));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => fake.frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', (h: number) => {
    fake.frames[h - 1] = () => undefined;
  });
  fake.engines.length = 0;
  fake.stacks.length = 0;
  fake.calls.length = 0;
  fake.frames.length = 0;
  fake.callsAfterDestroy = 0;
  Object.assign(viewerStats, { engines: 0, observers: 0, elementListeners: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

describe('viewport interactions', () => {
  it('attach only once the load is ready and are all removed on unmount', async () => {
    const hook = mountViewer('study-A');
    const s = await resolveStack('study-A');
    const loading = viewerStats.elementListeners;
    wheel(-100);
    expect(callsNamed('setZoom')).toHaveLength(0);

    await act(async () => s.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(viewerStats.elementListeners).toBe(loading + INTERACTION_LISTENERS);

    hook.unmount();
    expect(viewerStats.elementListeners).toBe(loading);
  });

  it('pointer and wheel events after unmount reach nothing', async () => {
    const { unmount } = await mountReady();
    pointer('pointerdown', 10, 10);
    unmount();
    const before = fake.calls.length;
    pointer('pointermove', 50, 50);
    wheel(-100);
    key('r');
    flushFrames();
    expect(fake.calls.length).toBe(before);
    expect(fake.callsAfterDestroy).toBe(0);
  });

  it('a late load for A after switching to B never binds interactions to the new engine', async () => {
    const hook = mountViewer('study-A');
    const a = await resolveStack('study-A');
    hook.rerender({ id: 'study-B' });
    const b = await resolveStack('study-B');
    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    const bound = viewerStats.elementListeners;

    await act(async () => a.d.resolve('late'));
    expect(viewerStats.elementListeners).toBe(bound);

    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom', a.engine)).toHaveLength(0);
    expect(callsNamed('setZoom', b.engine)).toHaveLength(1);
    expect(fake.callsAfterDestroy).toBe(0);
    hook.unmount();
    expect(viewerStats.elementListeners).toBe(0);
  });

  it('reset restores every transform and the window/level', async () => {
    const { result } = await mountReady();
    act(() => {
      result.current.zoomBy(2);
      result.current.rotateBy(90);
      result.current.flipH();
      result.current.flipV();
      result.current.toggleInvert();
      result.current.setWindowLevel(10, 20);
    });
    expect(result.current.view).toEqual({
      ...DEFAULT_VIEW,
      zoom: 2,
      rotation: 90,
      flipH: true,
      flipV: true,
      invert: true,
    });
    act(() => result.current.reset());
    expect(result.current.view).toEqual(DEFAULT_VIEW);
    expect(result.current.windowLevel).toEqual({ ww: 400, wl: 200 });
    expect(callsNamed('setViewPresentation').at(-1)?.args).toEqual([{ rotation: 0 }]);
    expect(callsNamed('resetCamera')).toHaveLength(1);
    expect(callsNamed('resetProperties')).toHaveLength(1);
    expect(callsNamed('setCamera').at(-1)?.args).toEqual([
      { flipHorizontal: false, flipVertical: false },
    ]);
  });

  it('keyboard: Shift+R rotates left, r right, 0 resets, i inverts', async () => {
    const { result } = await mountReady();
    const e = key('R', true);
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.view.rotation).toBe(270);
    expect(callsNamed('setViewPresentation').at(-1)?.args).toEqual([{ rotation: 270 }]);
    key('r');
    key('r');
    expect(result.current.view.rotation).toBe(90);
    key('i');
    expect(result.current.view.invert).toBe(true);
    key('0');
    expect(result.current.view).toEqual(DEFAULT_VIEW);
    expect(key('x').defaultPrevented).toBe(false);
  });

  it('arrow keys pan the camera and do not scroll the page', async () => {
    // jsdom has no layout: give the viewport a size (pan step = 10 % of it).
    Object.defineProperty(container, 'clientWidth', { value: 200 });
    Object.defineProperty(container, 'clientHeight', { value: 100 });
    await mountReady();
    const focal = () =>
      (callsNamed('setCamera').at(-1)?.args[0] as { focalPoint: number[] }).focalPoint;
    const e = key('ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    // Scale 2: the image moves 20 css px right, so the focal point moves 10 world units left.
    expect(focal()[0]).toBeCloseTo(-10);
    key('ArrowDown');
    expect(focal()[1]).toBeCloseTo(-5);
    key('ArrowLeft');
    key('ArrowUp');
    expect(focal()[0]).toBeCloseTo(0);
    expect(focal()[1]).toBeCloseTo(0);
  });

  it('tool switching changes what a drag does, renders at most once per frame', async () => {
    const { result } = await mountReady();
    expect(result.current.view.tool).toBe('windowLevel');
    const rendersBefore = callsNamed('render').length;
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 10, 0);
    pointer('pointermove', 20, 5);
    pointer('pointerup', 20, 5);
    expect(callsNamed('render').length).toBe(rendersBefore);
    flushFrames();
    expect(callsNamed('render').length).toBe(rendersBefore + 1);
    // Default window 400 -> 400/256 window units per dragged pixel.
    expect(result.current.windowLevel).toEqual({ ww: 431, wl: 208 });

    key('p');
    expect(result.current.view.tool).toBe('pan');
    const camerasBefore = callsNamed('setCamera').length;
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 30, 0);
    pointer('pointerup', 30, 0);
    flushFrames();
    expect(result.current.windowLevel).toEqual({ ww: 431, wl: 208 });
    const pan = callsNamed('setCamera').slice(camerasBefore);
    expect(pan).toHaveLength(1);
    // Scale 2: dragging 30 css px right moves the focal point 15 world units left.
    expect((pan[0]?.args[0] as { focalPoint: number[] }).focalPoint[0]).toBeCloseTo(-15);

    act(() => result.current.setTool('zoom'));
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 0, -50);
    flushFrames();
    expect(result.current.view.zoom).toBeGreaterThan(1);
  });

  it('wheel zoom prevents page scroll and is clamped to 2000%', async () => {
    const { result } = await mountReady();
    const e = wheel(-100);
    expect(e.defaultPrevented).toBe(true);
    for (let i = 0; i < 60; i += 1) wheel(-500);
    flushFrames();
    expect(result.current.view.zoom).toBe(20);
    expect(callsNamed('setZoom').at(-1)?.args).toEqual([40]);
  });

  it('flips act on screen axes: at 90 degrees Flip horizontal mirrors the image rows', async () => {
    const { result } = await mountReady();
    act(() => result.current.rotateBy(90));
    act(() => result.current.flipH());
    // CPU flips are applied in image axes before rotation (presentation-state order).
    expect(callsNamed('setCamera').at(-1)?.args).toEqual([
      { flipHorizontal: false, flipVertical: true },
    ]);
    expect(result.current.view).toMatchObject({ rotation: 90, flipH: false, flipV: true });
    key('v');
    expect(result.current.view).toMatchObject({ rotation: 90, flipH: true, flipV: true });
  });
});
