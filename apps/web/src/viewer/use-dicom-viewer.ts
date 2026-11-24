import { Enums, RenderingEngine, type Types } from '@cornerstonejs/core';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createAnnotationDrawing, type AnnotationDrawing } from './annotations/annotation-drawing';
import type { ImageMapper } from './annotations/annotation-geometry';
import { createImageMapper } from './annotations/image-mapper';
import { initCornerstone } from './cornerstone-init';
import { shouldRefitOnResize, type Size } from './viewer-math';
import { useViewportInteractions } from './use-viewport-interactions';
import { instrumentElement, trackEngine, trackObserver, viewerStats } from './viewer-stats';
import { emptyLoad, releaseLoad } from './viewer-teardown';
import {
  DEFAULT_VIEW,
  createViewportController,
  type ControllerSnapshot,
  type ViewTransform,
  type ViewerTool,
  type ViewportController,
} from './viewport-controller';
import {
  DECODE_ERROR,
  INIT_ERROR,
  VIEWPORT_ID,
  imageIdFor,
  readBaselineInvert,
  readMetadata,
  readPixelSpacing,
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
  view: ViewTransform;
  /** Load sequence that produced `ready`; interactions are bound per session. */
  session: number;
};

const IDLE: Omit<ViewState, 'view'> = {
  state: 'idle',
  error: null,
  metadata: null,
  windowLevel: null,
  session: 0,
};

// Rendering engines are looked up by id in a global cache, so ids must never be
// reused: a stale viewport resolving late would otherwise reach the NEXT viewer.
let engineCount = 0;

export type DicomViewer = Omit<ViewState, 'session'> & {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  setWindowLevel(ww: number, wl: number): void;
  /** Restores zoom, pan, rotation, flips, invert and window/level (not measurements). */
  resetView(): void;
  reset(): void;
  zoomBy(factor: number): void;
  rotateBy(degrees: number): void;
  flipH(): void;
  flipV(): void;
  toggleInvert(): void;
  setTool(tool: ViewerTool): void;
  /** Image <-> canvas mapping of the current load; null unless ready (never a destroyed viewport). */
  getMapper(): ImageMapper | null;
};

export function useDicomViewer(studyId: string | null): DicomViewer {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadSeq = useRef(0);
  const disposed = useRef(false);
  const controllerRef = useRef<ViewportController | null>(null);
  const drawingRef = useRef<AnnotationDrawing | null>(null);
  const mapperRef = useRef<ImageMapper | null>(null);
  // The active tool survives study changes; everything else resets per image.
  const toolRef = useRef<ViewerTool>(DEFAULT_VIEW.tool);
  const [snap, setSnap] = useState<ViewState>({ ...IDLE, view: DEFAULT_VIEW });
  const [snapFor, setSnapFor] = useState(studyId);

  // A study switch drops the previous image's snapshot during render, so not
  // even one frame shows A's metadata, readout or ready state under B.
  if (snapFor !== studyId) {
    setSnapFor(studyId);
    setSnap({
      ...IDLE,
      view: { ...DEFAULT_VIEW, tool: snap.view.tool },
      state: studyId === null ? 'idle' : 'loading',
    });
  }

  useEffect(() => {
    const el = containerRef.current;
    const idleView = { ...DEFAULT_VIEW, tool: toolRef.current };
    if (studyId === null || el === null) {
      setSnap({ ...IDLE, view: idleView });
      return;
    }
    loadSeq.current += 1;
    const seq = loadSeq.current;
    disposed.current = false;
    const imageId = imageIdFor(studyId);
    const owned = emptyLoad();
    // True when this load has been superseded (study change) or the viewer was
    // closed: the result must not touch the engine, the DOM or React state.
    const isStale = () => {
      if (seq !== loadSeq.current || disposed.current) {
        viewerStats.loadsDiscarded += 1;
        return true;
      }
      return false;
    };
    const fail = (error: string) => setSnap({ ...IDLE, view: idleView, state: 'error', error });

    setSnap({ ...IDLE, view: idleView, state: 'loading' });

    const run = async () => {
      try {
        await initCornerstone();
      } catch {
        if (isStale()) return;
        fail(INIT_ERROR);
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
      // Size the image was last fitted to. Comparing against it (not the previous
      // callback) lets a change that arrives in small steps still refit.
      let fitted: Size = { width: el.clientWidth, height: el.clientHeight };
      let previous = fitted;
      const observer = new ResizeObserver(() => {
        const next: Size = { width: el.clientWidth, height: el.clientHeight };
        // Real size changes refit the image; small ones such as a scrollbar
        // toggling keep the user's zoom and pan. Rotation, flips, invert and
        // window/level survive both.
        const refit = !loaded || shouldRefitOnResize(fitted, next);
        if (refit) fitted = next;
        // Always the refit path: 5.19.4's CPU keepCamera resize draws a blank
        // canvas, so a small resize restores zoom and centre itself.
        const centre = refit ? null : (owned.controller?.captureCentre(previous) ?? null);
        previous = next;
        engine.resize(true, false);
        if (!loaded) return;
        owned.controller?.afterResize(refit, centre);
        viewport.render();
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
        fail(DECODE_ERROR);
        return;
      }
      if (isStale()) return;

      loaded = true;
      viewport.render();
      // Read everything that can throw before publishing the load, so a
      // failure here cannot leave counters set next to an error state.
      const metadata = readMetadata(imageId);
      const mapper = createImageMapper(viewport);
      const controller = createViewportController(viewport, {
        tool: toolRef.current,
        baselineInvert: readBaselineInvert(imageId),
        onChange: ({ view, windowLevel }: ControllerSnapshot) => {
          if (seq !== loadSeq.current) return;
          toolRef.current = view.tool;
          setSnap((s) => ({ ...s, view, windowLevel }));
        },
      });
      owned.controller = controller;
      owned.mapper = mapper;
      if (mapper) {
        owned.drawing = createAnnotationDrawing({
          studyId,
          spacing: readPixelSpacing(imageId),
          imageSize: metadata ? { width: metadata.columns, height: metadata.rows } : null,
          mapper,
        });
      }
      controllerRef.current = controller;
      drawingRef.current = owned.drawing;
      mapperRef.current = mapper;
      viewerStats.currentImageId = imageId;
      viewerStats.loadsCompleted += 1;
      setSnap({
        state: 'ready',
        error: null,
        metadata,
        windowLevel: controller.windowLevel(),
        view: { ...DEFAULT_VIEW, tool: toolRef.current },
        session: seq,
      });
    };
    run().catch(() => {
      // Engine/viewport setup itself failed (e.g. no canvas support).
      if (isStale()) return;
      fail(INIT_ERROR);
    });

    return () => {
      loadSeq.current += 1;
      disposed.current = true;
      controllerRef.current = null;
      drawingRef.current = null;
      mapperRef.current = null;
      releaseLoad(owned, imageId);
    };
  }, [studyId]);

  // Null once the load is superseded or closed, so late events are no-ops.
  const getController = useCallback(() => (disposed.current ? null : controllerRef.current), []);
  const getDrawing = useCallback(() => (disposed.current ? null : drawingRef.current), []);
  const getMapper = useCallback(() => (disposed.current ? null : mapperRef.current), []);
  useViewportInteractions({
    elementRef: containerRef,
    active: snap.state === 'ready',
    session: snap.session,
    getController,
    getDrawing,
  });

  const setWindowLevel = useCallback(
    (ww: number, wl: number) => getController()?.setWindowLevel(ww, wl),
    [getController],
  );
  const reset = useCallback(() => getController()?.reset(), [getController]);
  const zoomBy = useCallback((f: number) => getController()?.zoomBy(f), [getController]);
  const rotateBy = useCallback((d: number) => getController()?.rotateBy(d), [getController]);
  const flipH = useCallback(() => getController()?.flip('h'), [getController]);
  const flipV = useCallback(() => getController()?.flip('v'), [getController]);
  const toggleInvert = useCallback(() => getController()?.toggleInvert(), [getController]);
  const setTool = useCallback(
    (tool: ViewerTool) => {
      toolRef.current = tool;
      // Switching tools mid-drawing drops the unfinished shape.
      getDrawing()?.cancel();
      const c = getController();
      if (c) c.setTool(tool);
      else setSnap((s) => ({ ...s, view: { ...s.view, tool } }));
    },
    [getController, getDrawing],
  );

  return {
    state: snap.state,
    error: snap.error,
    metadata: snap.metadata,
    windowLevel: snap.windowLevel,
    view: snap.view,
    containerRef,
    setWindowLevel,
    resetView: reset,
    reset,
    zoomBy,
    rotateBy,
    flipH,
    flipV,
    toggleInvert,
    setTool,
    getMapper,
  };
}
