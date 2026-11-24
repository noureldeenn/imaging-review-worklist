import {
  clampZoom,
  imageFlipAxis,
  normaliseRotation,
  windowLevelFromDrag,
  wlDragSensitivity,
} from './viewer-math';
import {
  clampWindowLevel,
  readWindowLevel,
  voiRangeFor,
  type StackViewportLike,
  type WindowLevel,
} from './viewer-session';

export type ViewerTool = 'windowLevel' | 'pan' | 'zoom';

/**
 * Display transform of the current image. Zoom is relative to fit (1 = 100 %);
 * flipH/flipV are the image's own axes, applied before rotation.
 */
export type ViewTransform = {
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  invert: boolean;
  tool: ViewerTool;
};

export const DEFAULT_VIEW: ViewTransform = {
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  invert: false,
  tool: 'windowLevel',
};

export type ControllerSnapshot = { view: ViewTransform; windowLevel: WindowLevel | null };
type Point = [number, number];
type Scheduler = { request(cb: () => void): number; cancel(handle: number): void };

/** `frame` mutations (drags, wheel, pinch) render at most once per animation frame. */
export type Timing = 'now' | 'frame';

export type ViewportController = {
  tool(): ViewerTool;
  windowLevel(): WindowLevel | null;
  setTool(tool: ViewerTool): void;
  zoomBy(factor: number, anchor?: Point, timing?: Timing): void;
  panBy(dx: number, dy: number, timing?: Timing): void;
  rotateBy(degrees: number): void;
  /** Mirrors along a SCREEN axis (mapped to image axes for the current rotation). */
  flip(screenAxis: 'h' | 'v'): void;
  toggleInvert(): void;
  setWindowLevel(ww: number, wl: number, timing?: Timing): void;
  dragWindowLevel(start: WindowLevel, dx: number, dy: number): void;
  reset(): void;
  /** The engine refits the camera on resize: zoom/pan return to fit, flips are re-applied. */
  afterResize(): void;
  dispose(): void;
};

type Options = {
  onChange(snapshot: ControllerSnapshot): void;
  tool: ViewerTool;
  scheduler?: Scheduler;
};

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Applies zoom / pan / rotation / flips / invert / window-level to ONE loaded
 * StackViewport through Cornerstone's camera and property API (CPU-rendering
 * safe, see ADR 0001). After `dispose()` every method is a no-op, so a late
 * pointer event can never reach a destroyed viewport.
 */
export function createViewportController(
  viewport: StackViewportLike,
  { onChange, tool, scheduler = browserScheduler }: Options,
): ViewportController {
  let disposed = false;
  let frame: number | null = null;
  let view: ViewTransform = { ...DEFAULT_VIEW, tool };
  let windowLevel = readWindowLevel(viewport);
  const sensitivity = wlDragSensitivity(windowLevel?.ww ?? 256);
  // Cornerstone's zoom is absolute (canvas px per image px); the fit scale is
  // read lazily the first time we zoom after a load, reset or resize.
  let fitScale: number | null = null;

  const publish = () => onChange({ view, windowLevel });
  const flush = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    viewport.render();
    publish();
  };
  const commit = (timing: Timing) => {
    if (timing === 'now') {
      flush();
      return;
    }
    frame ??= scheduler.request(() => {
      frame = null;
      if (disposed) return;
      viewport.render();
      publish();
    });
  };
  const shiftFocalPoint = (dx: number, dy: number, dz: number) => {
    const camera = viewport.getCamera();
    const [fx, fy, fz] = camera.focalPoint ?? [0, 0, 0];
    const [px, py, pz] = camera.position ?? [0, 0, 0];
    viewport.setCamera({
      focalPoint: [fx + dx, fy + dy, fz + dz],
      position: [px + dx, py + dy, pz + dz],
    });
  };
  // Moves the camera so that canvas point `from` ends up showing what `to` shows now.
  const panCanvas = (from: Point, to: Point) => {
    const a = viewport.canvasToWorld(from);
    const b = viewport.canvasToWorld(to);
    shiftFocalPoint(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  };
  const live = () => !disposed;
  const setWindowLevel = (ww: number, wl: number, timing: Timing) => {
    if (!live()) return;
    const next = clampWindowLevel(ww, wl);
    viewport.setProperties({ voiRange: voiRangeFor(next) });
    windowLevel = next;
    commit(timing);
  };

  return {
    tool: () => view.tool,
    windowLevel: () => windowLevel,
    setTool(next) {
      if (!live() || next === view.tool) return;
      view = { ...view, tool: next };
      publish();
    },
    zoomBy(factor, anchor, timing = 'now') {
      if (!live()) return;
      const next = clampZoom(view.zoom * factor);
      if (next === view.zoom) return;
      fitScale ??= viewport.getZoom() / view.zoom;
      const before = anchor ? viewport.canvasToWorld(anchor) : null;
      viewport.setZoom(fitScale * next);
      if (anchor && before) {
        const after = viewport.canvasToWorld(anchor);
        shiftFocalPoint(before[0] - after[0], before[1] - after[1], before[2] - after[2]);
      }
      view = { ...view, zoom: next };
      commit(timing);
    },
    panBy(dx, dy, timing = 'now') {
      if (!live() || (dx === 0 && dy === 0)) return;
      panCanvas([0, 0], [-dx, -dy]);
      commit(timing);
    },
    rotateBy(degrees) {
      if (!live()) return;
      const rotation = normaliseRotation(view.rotation + degrees);
      // 5.19.4: StackViewport.setProperties has no `rotation` and setCamera's CPU
      // path ignores it; setViewPresentation reaches setRotation on both paths.
      viewport.setViewPresentation({ rotation });
      view = { ...view, rotation };
      commit('now');
    },
    flip(screenAxis) {
      if (!live()) return;
      // Buttons flip what is on screen; the view keeps Cornerstone's image-axis flags.
      const axis = imageFlipAxis(screenAxis, view.rotation);
      view = axis === 'h' ? { ...view, flipH: !view.flipH } : { ...view, flipV: !view.flipV };
      viewport.setCamera({ flipHorizontal: view.flipH, flipVertical: view.flipV });
      commit('now');
    },
    toggleInvert() {
      if (!live()) return;
      view = { ...view, invert: !view.invert };
      viewport.setProperties({ invert: view.invert });
      commit('now');
    },
    setWindowLevel: (ww, wl, timing = 'now') => setWindowLevel(ww, wl, timing),
    dragWindowLevel(start, dx, dy) {
      const next = windowLevelFromDrag(start, dx, dy, sensitivity);
      setWindowLevel(next.ww, next.wl, 'frame');
    },
    reset() {
      if (!live()) return;
      // Rotation first: the CPU resetCamera() restores zoom, pan and flips but
      // keeps rotation. setCamera re-syncs the viewport's own flip flags, which
      // the CPU reset leaves stale. resetProperties() restores VOI and invert.
      viewport.setViewPresentation({ rotation: 0 });
      viewport.resetCamera();
      viewport.setCamera({ flipHorizontal: false, flipVertical: false });
      viewport.resetProperties();
      fitScale = null;
      windowLevel = readWindowLevel(viewport);
      view = { ...DEFAULT_VIEW, tool: view.tool };
      flush();
    },
    afterResize() {
      if (!live()) return;
      fitScale = null;
      viewport.setCamera({ flipHorizontal: view.flipH, flipVertical: view.flipV });
      view = { ...view, zoom: 1 };
      publish();
    },
    dispose() {
      disposed = true;
      if (frame !== null) scheduler.cancel(frame);
      frame = null;
    },
  };
}
