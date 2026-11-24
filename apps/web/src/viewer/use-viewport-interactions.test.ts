import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fake } from '../test/fake-cornerstone';
import {
  callsNamed,
  container,
  flushFrames,
  installViewerHarness,
  key,
  mountReady,
  mountViewer,
  pointer,
  resolveStack,
  wheel,
} from '../test/viewer-harness';
import { INTERACTION_LISTENERS, bindViewportInteractions } from './use-viewport-interactions';
import type { ViewportController } from './viewport-controller';
import { instrumentElement, viewerStats } from './viewer-stats';

// Listener lifecycle of the viewport interactions. The fake engine adds one
// listener of its own when it enables the element (ENGINE below).
vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

installViewerHarness();

const ENGINE = 1;
const listeners = () => viewerStats.elementListeners;

function fakeController(): ViewportController {
  return {
    tool: () => 'pan',
    windowLevel: () => ({ ww: 400, wl: 200 }),
    setTool: vi.fn(),
    zoomBy: vi.fn(),
    panBy: vi.fn(),
    rotateBy: vi.fn(),
    flip: vi.fn(),
    toggleInvert: vi.fn(),
    setWindowLevel: vi.fn(),
    dragWindowLevel: vi.fn(),
    reset: vi.fn(),
    captureCentre: () => null,
    afterResize: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('viewport interaction lifecycle', () => {
  it('binds only once the load is ready and unbinds everything on unmount', async () => {
    // Count from the start, so a bind before the load is ready would show up.
    instrumentElement(container());
    const hook = mountViewer('study-A');
    const s = await resolveStack('study-A');
    // While loading only the engine's own listener exists (no interactions yet).
    expect(listeners()).toBe(ENGINE);
    wheel(-100);
    expect(callsNamed('setZoom')).toHaveLength(0);

    await act(async () => s.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(listeners()).toBe(ENGINE + INTERACTION_LISTENERS);

    hook.unmount();
    expect(listeners()).toBe(0);
  });

  it('pointer, wheel and key events after unmount reach nothing', async () => {
    const { unmount } = await mountReady();
    pointer('pointerdown', 10, 10);
    unmount();
    expect(listeners()).toBe(0);
    const before = fake.calls.length;
    pointer('pointermove', 50, 50);
    wheel(-100);
    key('r');
    flushFrames();
    expect(fake.calls.length).toBe(before);
    expect(fake.callsAfterDestroy).toBe(0);
  });

  it('while bound, a null controller turns every event into a no-op', () => {
    const el = container();
    instrumentElement(el);
    const c = fakeController();
    let current: ViewportController | null = c;
    const unbind = bindViewportInteractions(el, () => current);
    expect(listeners()).toBe(INTERACTION_LISTENERS);

    pointer('pointerdown', 0, 0);
    current = null;
    pointer('pointermove', 40, 0);
    expect(wheel(-100).defaultPrevented).toBe(false);
    expect(key('r').defaultPrevented).toBe(false);
    expect(c.panBy).not.toHaveBeenCalled();
    expect(c.zoomBy).not.toHaveBeenCalled();
    expect(c.rotateBy).not.toHaveBeenCalled();

    unbind();
    expect(listeners()).toBe(0);
  });

  it('releases captured pointers on unbind and forgets a pointer whose capture was lost', () => {
    const el = container();
    const captured = new Set<number>();
    el.setPointerCapture = (id: number) => void captured.add(id);
    el.hasPointerCapture = (id: number) => captured.has(id);
    el.releasePointerCapture = (id: number) => void captured.delete(id);
    const c = fakeController();
    const unbind = bindViewportInteractions(el, () => c);

    pointer('pointerdown', 0, 0, { id: 7 });
    expect(captured.has(7)).toBe(true);
    const lost = new MouseEvent('lostpointercapture');
    Object.defineProperty(lost, 'pointerId', { value: 7 });
    el.dispatchEvent(lost);
    pointer('pointermove', 30, 0, { id: 7 });
    expect(c.panBy).not.toHaveBeenCalled();

    pointer('pointerdown', 0, 0, { id: 8 });
    expect(captured.has(8)).toBe(true);
    unbind();
    expect(captured.size).toBe(0);
  });

  it('a late load for A after switching to B never binds interactions to the new engine', async () => {
    const hook = mountViewer('study-A');
    const a = await resolveStack('study-A');
    hook.rerender({ id: 'study-B' });
    const b = await resolveStack('study-B');
    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(listeners()).toBe(ENGINE + INTERACTION_LISTENERS);

    await act(async () => a.d.resolve('late'));
    expect(listeners()).toBe(ENGINE + INTERACTION_LISTENERS);

    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom', a.engine)).toHaveLength(0);
    expect(callsNamed('setZoom', b.engine)).toHaveLength(1);
    expect(fake.callsAfterDestroy).toBe(0);
    hook.unmount();
    expect(listeners()).toBe(0);
  });

  it('a ready-to-ready switch unbinds A and binds B exactly once on the same element', async () => {
    const hook = await mountReady('study-A');
    const engineA = fake.engines.length - 1;
    expect(listeners()).toBe(ENGINE + INTERACTION_LISTENERS);

    hook.rerender({ id: 'study-B' });
    const b = await resolveStack('study-B');
    expect(hook.result.current.state).toBe('loading');
    expect(listeners()).toBe(ENGINE);
    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom')).toHaveLength(0);

    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(listeners()).toBe(ENGINE + INTERACTION_LISTENERS);
    wheel(-100);
    flushFrames();
    expect(callsNamed('setZoom', engineA)).toHaveLength(0);
    expect(callsNamed('setZoom', b.engine)).toHaveLength(1);

    hook.unmount();
    expect(listeners()).toBe(0);
    expect(fake.callsAfterDestroy).toBe(0);
  });
});
