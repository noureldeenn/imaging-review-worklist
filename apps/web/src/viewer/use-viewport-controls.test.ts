import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fake, fakeViewports } from '../test/fake-cornerstone';
import {
  callsNamed,
  container,
  flushFrames,
  installViewerHarness,
  key,
  mountReady,
  pointer,
  resizeObservers,
  wheel,
} from '../test/viewer-harness';
import { DEFAULT_VIEW } from './viewport-controller';

// What each control does to the (fake) Cornerstone viewport. Listener
// lifecycle is covered in use-viewport-interactions.test.ts.
vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

installViewerHarness();

const lastArgs = (name: string) => callsNamed(name).at(-1)?.args;

describe('viewer controls', () => {
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
    expect(lastArgs('setViewPresentation')).toEqual([{ rotation: 0 }]);
    expect(callsNamed('resetCamera')).toHaveLength(1);
    expect(callsNamed('resetProperties')).toHaveLength(1);
    expect(lastArgs('setCamera')).toEqual([{ flipHorizontal: false, flipVertical: false }]);
    expect(lastArgs('setProperties')).toEqual([{ invert: false }]);
  });

  it('keyboard: Shift+R rotates left, r right, 0 resets, i inverts', async () => {
    const { result } = await mountReady();
    const e = key('R', true);
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.view.rotation).toBe(270);
    expect(lastArgs('setViewPresentation')).toEqual([{ rotation: 270 }]);
    key('r');
    key('r');
    expect(result.current.view.rotation).toBe(90);
    key('i');
    expect(result.current.view.invert).toBe(true);
    key('0');
    expect(result.current.view).toEqual(DEFAULT_VIEW);
    expect(key('x').defaultPrevented).toBe(false);
  });

  it('OHIF keys: l/p/z pick the tool, < , > . rotate, h/v flip, i inverts (w stays an alias)', async () => {
    const { result } = await mountReady();
    const tool = () => result.current.view.tool;
    expect(key('p').defaultPrevented).toBe(true);
    expect(tool()).toBe('pan');
    key('z');
    expect(tool()).toBe('zoom');
    key('l');
    expect(tool()).toBe('windowLevel');
    key('z');
    key('w');
    expect(tool()).toBe('windowLevel');

    expect(key('>').defaultPrevented).toBe(true);
    expect(result.current.view.rotation).toBe(90);
    key('.');
    expect(result.current.view.rotation).toBe(180);
    key('<');
    expect(result.current.view.rotation).toBe(90);
    key(',');
    expect(result.current.view.rotation).toBe(0);

    key('h');
    expect(result.current.view).toMatchObject({ flipH: true, flipV: false });
    key('v');
    expect(result.current.view).toMatchObject({ flipH: true, flipV: true });
    key('i');
    expect(result.current.view.invert).toBe(true);
    key('0');
    expect(result.current.view).toEqual(DEFAULT_VIEW);
  });

  it('arrow keys pan the camera and do not scroll the page', async () => {
    // jsdom has no layout: give the viewport a size (pan step = 10 % of it).
    Object.defineProperty(container(), 'clientWidth', { value: 200 });
    Object.defineProperty(container(), 'clientHeight', { value: 100 });
    await mountReady();
    const focal = () => (lastArgs('setCamera')?.[0] as { focalPoint: number[] }).focalPoint;
    // Fit: the canvas centre (100, 50) shows world (50, 25) at scale 2.
    const e = key('ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    // The image moves 20 css px right, so the focal point moves 10 world units left.
    expect(focal()[0]).toBeCloseTo(40);
    key('ArrowDown');
    expect(focal()[1]).toBeCloseTo(20);
    key('ArrowLeft');
    key('ArrowUp');
    expect(focal()[0]).toBeCloseTo(50);
    expect(focal()[1]).toBeCloseTo(25);
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
    expect(lastArgs('setZoom')).toEqual([40]);
  });

  it('flips act on screen axes: at 90 degrees Flip horizontal mirrors the image rows', async () => {
    const { result } = await mountReady();
    act(() => result.current.rotateBy(90));
    act(() => result.current.flipH());
    // CPU flips are applied in image axes before rotation (presentation-state order).
    expect(lastArgs('setCamera')).toEqual([{ flipHorizontal: false, flipVertical: true }]);
    expect(result.current.view).toMatchObject({ rotation: 90, flipH: false, flipV: true });
    key('v');
    expect(result.current.view).toMatchObject({ rotation: 90, flipH: true, flipV: true });
  });

  it('MONOCHROME1: Invert is relative to the as-loaded polarity and Reset restores it', async () => {
    // The CPU path shows MONOCHROME1 inverted via its own viewport flag
    // (image.invert); the user's Invert is relative to that baseline.
    fake.photometric = 'MONOCHROME1';
    const { result } = await mountReady();
    expect(result.current.view.invert).toBe(false);

    act(() => result.current.toggleInvert());
    expect(lastArgs('setProperties')).toEqual([{ invert: false }]);
    expect(result.current.view.invert).toBe(true);
    act(() => result.current.toggleInvert());
    expect(lastArgs('setProperties')).toEqual([{ invert: true }]);
    expect(result.current.view.invert).toBe(false);

    act(() => result.current.toggleInvert());
    act(() => result.current.reset());
    // resetProperties() would leave invert=false (initialInvert); the baseline is re-applied after it.
    const order = fake.calls.map((c) => c.name);
    expect(order.lastIndexOf('setProperties')).toBeGreaterThan(
      order.lastIndexOf('resetProperties'),
    );
    expect(lastArgs('setProperties')).toEqual([{ invert: true }]);
    expect(result.current.view.invert).toBe(false);
  });

  it('a small resize keeps zoom and pan; a real one refits zoom but keeps orientation', async () => {
    const size = { w: 800, h: 600 };
    Object.defineProperty(container(), 'clientWidth', { get: () => size.w });
    Object.defineProperty(container(), 'clientHeight', { get: () => size.h });
    const { result } = await mountReady();
    const observer = resizeObservers[0];
    if (!observer) throw new Error('no resize observer');
    act(() => {
      result.current.zoomBy(2);
      result.current.rotateBy(90);
      result.current.toggleInvert();
    });
    act(() => result.current.setTool('pan'));
    pointer('pointerdown', 0, 0, { id: 2 });
    pointer('pointermove', 40, 0, { id: 2 });
    pointer('pointerup', 40, 0, { id: 2 });
    flushFrames();
    const viewport = fakeViewports.at(-1);
    if (!viewport) throw new Error('no viewport');
    const centreBefore = viewport.getCamera().focalPoint;

    size.w = 785; // a classic scrollbar appearing
    act(() => observer.trigger());
    // The engine refits (keepCamera=false); zoom and the world point that was at
    // the centre of the OLD canvas are then restored at the new centre.
    expect(lastArgs('resize')).toEqual([false]);
    expect(lastArgs('setZoom')).toEqual([4]); // fake fit scale 2 x zoom 2
    const centreAfter = viewport.getCamera().focalPoint;
    expect(centreAfter[0]).toBeCloseTo(centreBefore[0] ?? Number.NaN);
    expect(centreAfter[1]).toBeCloseTo(centreBefore[1] ?? Number.NaN);
    expect(result.current.view).toMatchObject({ zoom: 2, rotation: 90, invert: true });

    // A change that arrives in small steps still refits once it adds up (800 -> 775).
    for (const w of [780, 775]) {
      size.w = w;
      act(() => observer.trigger());
    }
    expect(result.current.view).toMatchObject({ zoom: 1, rotation: 90, invert: true });

    act(() => result.current.zoomBy(2));
    size.h = 400;
    act(() => observer.trigger());
    expect(result.current.view).toMatchObject({ zoom: 1, rotation: 90, invert: true });
  });
});
