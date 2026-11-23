import { Enums, RenderingEngine, cache, type Types } from '@cornerstonejs/core';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { initCornerstone } from './cornerstone-init';
import { instrumentElement, trackEngine, trackObserver, viewerStats } from './viewer-stats';
import {
  DECODE_ERROR,
  INIT_ERROR,
  VIEWPORT_ID,
  clampWindowLevel,
  imageIdFor,
  readMetadata,
  readWindowLevel,
  voiRangeFor,
  type StackViewportLike,
  type ViewerMetadataValue,
  type ViewerState,
  type WindowLevel,
} from './viewer-session';

type ViewState = {
  state: ViewerState;
  error: string | null;
  metadata: ViewerMetadataValue | null;
  windowLevel: WindowLevel | null;
};

const IDLE: ViewState = { state: 'idle', error: null, metadata: null, windowLevel: null };

// Rendering engines are looked up by id in a global cache, so ids must never be
// reused: a stale viewport resolving late would otherwise reach the NEXT viewer.
let engineCount = 0;

export type DicomViewer = ViewState & {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  setWindowLevel(ww: number, wl: number): void;
  resetView(): void;
};

export function useDicomViewer(studyId: string | null): DicomViewer {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadSeq = useRef(0);
  const disposed = useRef(false);
  const viewportRef = useRef<StackViewportLike | null>(null);
  const [view, setView] = useState<ViewState>(IDLE);

  useEffect(() => {
    const el = containerRef.current;
    if (studyId === null || el === null) {
      setView(IDLE);
      return;
    }
    loadSeq.current += 1;
    const seq = loadSeq.current;
    disposed.current = false;
    const imageId = imageIdFor(studyId);
    const owned: {
      engine: RenderingEngine | null;
      observer: ResizeObserver | null;
      viewport: StackViewportLike | null;
    } = { engine: null, observer: null, viewport: null };
    // True when this load has been superseded (study change) or the viewer was
    // closed: the result must not touch the engine, the DOM or React state.
    const isStale = () => {
      if (seq !== loadSeq.current || disposed.current) {
        viewerStats.loadsDiscarded += 1;
        return true;
      }
      return false;
    };

    setView({ ...IDLE, state: 'loading' });

    const run = async () => {
      try {
        await initCornerstone();
      } catch {
        if (isStale()) return;
        setView({ ...IDLE, state: 'error', error: INIT_ERROR });
        return;
      }
      if (isStale()) return;

      instrumentElement(el);
      engineCount += 1;
      const engine = new RenderingEngine(`viewer-${engineCount}`);
      owned.engine = engine;
      trackEngine(1);
      engine.enableElement({
        viewportId: VIEWPORT_ID,
        type: Enums.ViewportType.STACK,
        element: el,
      });
      const viewport: StackViewportLike = engine.getViewport<Types.IStackViewport>(VIEWPORT_ID);
      owned.viewport = viewport;

      let loaded = false;
      const observer = new ResizeObserver(() => {
        engine.resize(true, false);
        if (loaded) viewport.render();
      });
      observer.observe(el);
      owned.observer = observer;
      trackObserver(1);

      try {
        await viewport.setStack([imageId]);
      } catch {
        if (isStale()) return;
        // Engine stays alive while the error is shown; the effect cleanup
        // (study change or close) releases it like any other load.
        setView({ ...IDLE, state: 'error', error: DECODE_ERROR });
        return;
      }
      if (isStale()) return;

      loaded = true;
      viewport.render();
      // Read everything that can throw before publishing the load, so a
      // failure here cannot leave counters set next to an error state.
      const metadata = readMetadata(imageId);
      const windowLevel = readWindowLevel(viewport);
      viewportRef.current = viewport;
      viewerStats.currentImageId = imageId;
      viewerStats.loadsCompleted += 1;
      setView({ state: 'ready', error: null, metadata, windowLevel });
    };
    run().catch(() => {
      // Engine/viewport setup itself failed (e.g. no canvas support).
      if (isStale()) return;
      setView({ ...IDLE, state: 'error', error: INIT_ERROR });
    });

    return () => {
      loadSeq.current += 1;
      disposed.current = true;
      viewportRef.current = null;
      if (owned.observer) {
        owned.observer.disconnect();
        trackObserver(-1);
      }
      if (owned.viewport) {
        // Cornerstone 5.19.4's CPU load callback ignores `isDisabled` and calls
        // render() through the engine cache when a request lands after destroy,
        // throwing an uncaught TypeError. Disarm the dead viewport so a late
        // load settles quietly (and is then counted as discarded).
        owned.viewport.render = () => undefined;
      }
      if (owned.engine) {
        try {
          owned.engine.destroy();
        } catch {
          // Already torn down; nothing left to release.
        }
        trackEngine(-1);
      }
      try {
        cache.removeImageLoadObject(imageId);
      } catch {
        // Not cached (load never finished or failed): nothing to evict.
      }
      viewerStats.currentImageId = null;
    };
  }, [studyId]);

  const setWindowLevel = useCallback((ww: number, wl: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = clampWindowLevel(ww, wl);
    viewport.setProperties({ voiRange: voiRangeFor(next) });
    viewport.render();
    setView((v) => ({ ...v, windowLevel: next }));
  }, []);

  const resetView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
    const windowLevel = readWindowLevel(viewport);
    setView((v) => ({ ...v, windowLevel }));
  }, []);

  return { ...view, containerRef, setWindowLevel, resetView };
}
