import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { useDicomViewer } from '../viewer/use-dicom-viewer';
import { viewerStats } from '../viewer/viewer-stats';
import { fake, resetFake } from './fake-cornerstone';

// Shared driver for the viewer hook tests. Test files must still declare:
//   vi.mock('./cornerstone-init', ...) and
//   vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'))

/** Resize observers created by the hook; `trigger` runs their callbacks. */
export const resizeObservers: Array<{ trigger(): void }> = [];

class FakeResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {
    resizeObservers.push({ trigger: () => this.cb([], this as unknown as ResizeObserver) });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

let el: HTMLDivElement | null = null;

/** The viewport container of the current test. */
export function container(): HTMLDivElement {
  if (!el) throw new Error('viewer harness not installed');
  return el;
}

/** Registers the per-test setup (fakes reset, rAF queue, fresh container). */
export function installViewerHarness(): void {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => fake.frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (h: number) => {
      fake.frames[h - 1] = () => undefined;
    });
    resetFake();
    resizeObservers.length = 0;
    Object.assign(viewerStats, { engines: 0, observers: 0, elementListeners: 0 });
    el = document.createElement('div');
    document.body.appendChild(el);
  });
  afterEach(() => {
    el?.remove();
    el = null;
    vi.unstubAllGlobals();
  });
}

export function mountViewer(initial: string | null) {
  return renderHook(
    ({ id }: { id: string | null }) => {
      const v = useDicomViewer(id);
      v.containerRef.current = container();
      return v;
    },
    { initialProps: { id: initial } },
  );
}

export async function resolveStack(study: string) {
  await waitFor(() => expect(fake.stacks.find((s) => s.imageId.includes(study))).toBeDefined());
  const s = fake.stacks.find((x) => x.imageId.includes(study));
  if (!s) throw new Error('no stack');
  return s;
}

export async function mountReady(study = 'study-A') {
  const hook = mountViewer(study);
  const s = await resolveStack(study);
  await act(async () => s.d.resolve('ok'));
  await waitFor(() => expect(hook.result.current.state).toBe('ready'));
  return hook;
}

function dispatch<E extends Event>(e: E, target: EventTarget = container()): E {
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

export function pointer(
  type: string,
  x: number,
  y: number,
  init: { id?: number; button?: number } = {},
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: init.button ?? 0,
  });
  Object.defineProperty(e, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  return dispatch(e);
}

export function key(k: string, shiftKey = false) {
  return dispatch(
    new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }),
  );
}

export function wheel(deltaY: number) {
  return dispatch(new WheelEvent('wheel', { deltaY, clientX: 10, clientY: 10, cancelable: true }));
}

export function flushFrames() {
  act(() => {
    const queued = fake.frames.splice(0);
    queued.forEach((cb) => cb());
  });
}

export const callsNamed = (name: string, engine?: number) =>
  fake.calls.filter((c) => c.name === name && (engine === undefined || c.engine === engine));
