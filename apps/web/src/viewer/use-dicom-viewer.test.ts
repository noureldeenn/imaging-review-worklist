import { act, renderHook, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, type Deferred } from '../test/deferred';
import { useDicomViewer } from './use-dicom-viewer';
import { INTERACTION_LISTENERS } from './use-viewport-interactions';
import { viewerStats } from './viewer-stats';

// The real rendering engine needs a browser canvas pipeline; it is covered by
// the Playwright tests. Here the cornerstone modules are replaced by fakes whose
// setStack returns a Deferred the test resolves in whatever order it needs.
type PendingStack = { imageId: string; d: Deferred<string> };

const fake = vi.hoisted(() => ({
  engines: [] as Array<{ id: string; destroyed: boolean }>,
  stacks: [] as PendingStack[],
  renders: 0,
  // Calls that reach an engine after destroy() are recorded, not thrown, so a
  // missing stale guard cannot hide behind the hook's backstop catch.
  rendersAfterDestroy: 0,
  setStackAfterDestroy: 0,
  observers: new Set<object>(),
  // When set, initCornerstone() waits on this promise.
  initGate: null as Promise<void> | null,
}));

vi.mock('./cornerstone-init', () => ({
  initCornerstone: () => fake.initGate ?? Promise.resolve(),
}));

vi.mock('@cornerstonejs/core', async () => {
  const { deferred } = await import('../test/deferred');
  class RenderingEngine {
    destroyed = false;
    private element: HTMLElement | null = null;
    private readonly onWheel = () => undefined;
    readonly viewport = {
      setStack: (ids: string[]) => {
        if (this.destroyed) fake.setStackAfterDestroy += 1;
        const d = deferred<string>();
        fake.stacks.push({ imageId: ids[0] ?? '', d });
        return d.promise;
      },
      render: () => {
        if (this.destroyed) fake.rendersAfterDestroy += 1;
        else fake.renders += 1;
      },
      getProperties: () => ({ voiRange: { lower: 0, upper: 400 } }),
      setProperties: () => undefined,
      resetCamera: () => undefined,
      resetProperties: () => undefined,
    };
    constructor(readonly id: string) {
      fake.engines.push(this);
    }
    enableElement({ element }: { element: HTMLElement }) {
      this.element = element;
      element.addEventListener('wheel', this.onWheel);
    }
    getViewport() {
      return this.viewport;
    }
    resize() {}
    destroy() {
      this.destroyed = true;
      this.element?.removeEventListener('wheel', this.onWheel);
      this.element = null;
    }
  }
  const modules: Record<string, object> = {
    generalSeriesModule: { modality: 'OT' },
    generalStudyModule: { studyDate: '20261007' },
    imagePixelModule: { rows: 256, columns: 256 },
  };
  return {
    RenderingEngine,
    Enums: { ViewportType: { STACK: 'stack' } },
    cache: { removeImageLoadObject: () => undefined },
    metaData: { get: (type: string) => modules[type] },
  };
});

class FakeResizeObserver {
  constructor(readonly _cb: ResizeObserverCallback) {}
  observe() {
    fake.observers.add(this);
  }
  unobserve() {}
  disconnect() {
    fake.observers.delete(this);
  }
}

const DECODE_ERROR = 'Could not decode this file (not a valid DICOM image).';
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

const stackFor = (study: string) =>
  fake.stacks.find((s) => s.imageId === `wadouri:/api/studies/${study}/file`);

async function waitForStack(study: string): Promise<PendingStack> {
  await waitFor(() => expect(stackFor(study)).toBeDefined());
  const s = stackFor(study);
  if (!s) throw new Error(`no stack for ${study}`);
  return s;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  fake.engines.length = 0;
  fake.stacks.length = 0;
  fake.renders = 0;
  fake.rendersAfterDestroy = 0;
  fake.setStackAfterDestroy = 0;
  fake.observers.clear();
  fake.initGate = null;
  Object.assign(viewerStats, {
    engines: 0,
    observers: 0,
    elementListeners: 0,
    loadsCompleted: 0,
    loadsDiscarded: 0,
    currentImageId: null,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

describe('useDicomViewer', () => {
  it('a delayed load for study A does not apply after switching to B', async () => {
    const { result, rerender } = mountViewer('study-A');
    const a = await waitForStack('study-A');

    rerender({ id: 'study-B' });
    const b = await waitForStack('study-B');
    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(async () => a.d.resolve('late'));

    expect(fake.rendersAfterDestroy).toBe(0);
    expect(fake.setStackAfterDestroy).toBe(0);
    expect(viewerStats.currentImageId).toMatch(/study-B\/file$/);
    expect(viewerStats.loadsDiscarded).toBe(1);
    expect(viewerStats.loadsCompleted).toBe(1);
    expect(viewerStats.engines).toBe(1);
    expect(result.current.state).toBe('ready');
    expect(result.current.metadata).toEqual({
      modality: 'OT',
      studyDate: '2026-10-07',
      rows: 256,
      columns: 256,
    });
    expect(result.current.windowLevel).toEqual({ ww: 400, wl: 200 });
  });

  it('closing during a pending load destroys the engine and the late resolve touches nothing', async () => {
    const { unmount } = mountViewer('study-A');
    const a = await waitForStack('study-A');
    const rendersBefore = fake.renders;

    unmount();
    expect(viewerStats.engines).toBe(0);
    expect(viewerStats.observers).toBe(0);
    expect(fake.engines.every((e) => e.destroyed)).toBe(true);

    await act(async () => a.d.resolve('late'));

    expect(fake.renders).toBe(rendersBefore);
    expect(fake.rendersAfterDestroy).toBe(0);
    expect(fake.setStackAfterDestroy).toBe(0);
    expect(viewerStats.engines).toBe(0);
    expect(viewerStats.currentImageId).toBeNull();
    expect(viewerStats.loadsCompleted).toBe(0);
    expect(viewerStats.loadsDiscarded).toBe(1);
  });

  it('five mount/unmount cycles leave engines=0, observers=0, elementListeners at baseline', async () => {
    const baseline = viewerStats.elementListeners;
    for (let i = 0; i < 5; i += 1) {
      const { result, unmount } = mountViewer('study-A');
      const s = await waitForStack('study-A');
      await act(async () => s.d.resolve('ok'));
      await waitFor(() => expect(result.current.state).toBe('ready'));
      expect(viewerStats.engines).toBe(1);
      // engine wheel listener + the viewer's own interaction listeners
      expect(viewerStats.elementListeners).toBe(baseline + 1 + INTERACTION_LISTENERS);
      unmount();
      fake.stacks.length = 0;
    }
    expect(viewerStats.engines).toBe(0);
    expect(viewerStats.observers).toBe(0);
    expect(fake.observers.size).toBe(0);
    expect(viewerStats.elementListeners).toBe(baseline);
    expect(viewerStats.loadsCompleted).toBe(5);
    expect(fake.engines).toHaveLength(5);
    expect(fake.engines.every((e) => e.destroyed)).toBe(true);
  });

  it('a rejected load sets state error with the decode message and keeps the engine', async () => {
    const { result, rerender } = mountViewer('study-003');
    const bad = await waitForStack('study-003');
    await act(async () => bad.d.reject(new Error('dicomParser: invalid')));

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toBe(DECODE_ERROR);
    expect(viewerStats.engines).toBe(1);
    expect(fake.engines[0]?.destroyed).toBe(false);
    expect(viewerStats.currentImageId).toBeNull();

    rerender({ id: 'study-001' });
    const good = await waitForStack('study-001');
    await act(async () => good.d.resolve('ok'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(viewerStats.currentImageId).toMatch(/study-001\/file$/);
    expect(viewerStats.engines).toBe(1);
  });
  it('a stale load for A that rejects after the switch leaves B ready', async () => {
    const { result, rerender } = mountViewer('study-A');
    const a = await waitForStack('study-A');

    rerender({ id: 'study-B' });
    const b = await waitForStack('study-B');
    await act(async () => b.d.resolve('ok'));
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(async () => a.d.reject(new Error('late decode failure')));

    expect(result.current.state).toBe('ready');
    expect(result.current.error).toBeNull();
    expect(viewerStats.currentImageId).toMatch(/study-B\/file$/);
    expect(viewerStats.loadsDiscarded).toBe(1);
    expect(fake.rendersAfterDestroy).toBe(0);
  });

  it('closing while cornerstone init is pending never creates an engine', async () => {
    const gate = deferred<void>();
    fake.initGate = gate.promise;
    const { unmount } = mountViewer('study-A');
    unmount();

    await act(async () => gate.resolve());

    expect(fake.engines).toHaveLength(0);
    expect(fake.stacks).toHaveLength(0);
    expect(viewerStats.engines).toBe(0);
    expect(viewerStats.observers).toBe(0);
    expect(viewerStats.loadsDiscarded).toBe(1);
  });

  it('a study switch never renders the previous image as ready (no stale info-strip frame)', async () => {
    const seen: Array<{ id: string | null; state: string; metadata: unknown }> = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => {
        const v = useDicomViewer(id);
        v.containerRef.current = container;
        // Committed renders only (a render React discards is never painted).
        useLayoutEffect(() => {
          seen.push({ id, state: v.state, metadata: v.metadata });
        });
        return v;
      },
      { initialProps: { id: 'study-A' as string | null } },
    );
    const a = await waitForStack('study-A');
    await act(async () => a.d.resolve('ok'));
    await waitFor(() => expect(result.current.state).toBe('ready'));

    seen.length = 0;
    rerender({ id: 'study-B' });
    const underB = seen.filter((s) => s.id === 'study-B');
    expect(underB.length).toBeGreaterThan(0);
    expect(underB.every((s) => s.state !== 'ready' && s.metadata === null)).toBe(true);
  });
});
