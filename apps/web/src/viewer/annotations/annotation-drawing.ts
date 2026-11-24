import { useAnnotationStore } from './annotation-store';
import {
  POINTS_NEEDED,
  canvasDistance,
  hitTest,
  moveHandle,
  type ImageMapper,
} from './annotation-geometry';
import { isMeasurementTool, type MeasurementKind, type Point, type Spacing } from './measure-math';

/** Movement (canvas px) below which a press-release is a click / a tiny drag that draws nothing. */
export const CLICK_TOLERANCE = 4;
/** Hit radius (canvas px) for selecting outlines and handles. */
export const HIT_RADIUS = { mouse: 6, touch: 14 } as const;

type Scheduler = { request(cb: () => void): number; cancel(handle: number): void };

type State =
  | { kind: 'idle' }
  | {
      kind: 'drag';
      tool: Exclude<MeasurementKind, 'angle'>;
      id: number;
      from: Point;
      start: Point;
      end: Point;
    }
  | { kind: 'angle'; points: Point[]; cursor: Point; press: { id: number; from: Point } | null }
  | {
      kind: 'handle';
      id: number;
      target: string;
      handle: number;
      original: Point[];
      points: Point[];
    };

export type PointerInput = { id: number; point: Point; tool: string; touch: boolean };

/**
 * Pointer/keyboard state machine for the measurement tools of ONE loaded image.
 * Events arrive through the viewport's existing bind/unbind (no listeners of
 * its own); after `dispose()` every method is a no-op.
 */
export type AnnotationDrawing = {
  /** True when the press was taken (drawing, selecting or dragging a handle). */
  pointerDown(input: PointerInput): boolean;
  pointerMove(id: number, point: Point): boolean;
  /** Mouse moves with no button down: the angle's rubber band. */
  hover(point: Point): void;
  pointerUp(id: number, point: Point): boolean;
  keyDown(key: string): boolean;
  /** Drops an in-progress drawing or handle drag (Escape, second pointer, tool change). */
  cancel(): void;
  dispose(): void;
};

type Options = {
  studyId: string;
  spacing: Spacing | null;
  /** Columns x rows; points are clamped to the image. */
  imageSize: { width: number; height: number } | null;
  mapper: ImageMapper;
  scheduler?: Scheduler;
};

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createAnnotationDrawing({
  studyId,
  spacing,
  imageSize,
  mapper,
  scheduler = browserScheduler,
}: Options): AnnotationDrawing {
  const store = () => useAnnotationStore.getState();
  let state: State = { kind: 'idle' };
  let disposed = false;
  let frame: number | null = null;

  const clamp = (v: number, max: number | undefined) =>
    max === undefined ? v : Math.min(max, Math.max(0, v));
  const toImage = (p: Point): Point => {
    const [x, y] = mapper.toImage(p);
    return [clamp(x, imageSize?.width), clamp(y, imageSize?.height)];
  };

  // Preview (draft, handle drag) reaches the store at most once per animation frame.
  const flush = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    const s = state;
    if (s.kind === 'drag') store().setDraft({ studyId, kind: s.tool, points: [s.start, s.end] });
    else if (s.kind === 'angle')
      store().setDraft({ studyId, kind: 'angle', points: [...s.points, s.cursor] });
    else if (s.kind === 'handle') store().update(studyId, s.target, s.points);
  };
  const schedule = () => {
    frame ??= scheduler.request(() => {
      frame = null;
      if (!disposed) flush();
    });
  };
  const finish = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    state = { kind: 'idle' };
    if (store().draft?.studyId === studyId) store().setDraft(null);
  };

  const cancel = () => {
    if (state.kind === 'handle') store().update(studyId, state.target, state.original);
    finish();
  };

  return {
    pointerDown({ id, point, tool, touch }) {
      if (disposed) return false;
      if (state.kind === 'angle') {
        state = { ...state, press: { id, from: point } };
        return true;
      }
      if (state.kind !== 'idle') cancel();
      const annotations = store().list(studyId);
      const radius = touch ? HIT_RADIUS.touch : HIT_RADIUS.mouse;
      const hit = hitTest(annotations, store().selectedIn(studyId), point, mapper, radius);
      if (hit) {
        store().select(studyId, hit.id);
        const target = annotations.find((a) => a.id === hit.id);
        if (hit.handle !== null && target) {
          const { points } = target;
          state = {
            kind: 'handle',
            id,
            target: hit.id,
            handle: hit.handle,
            original: points,
            points,
          };
        }
        return true;
      }
      if (store().selectedIn(studyId) !== null) store().select(studyId, null);
      if (!isMeasurementTool(tool)) return false;
      const start = toImage(point);
      state =
        tool === 'angle'
          ? { kind: 'angle', points: [], cursor: start, press: { id, from: point } }
          : { kind: 'drag', tool, id, from: point, start, end: start };
      return true;
    },
    pointerMove(id, point) {
      if (disposed) return false;
      const s = state;
      if (s.kind === 'drag' && s.id === id) state = { ...s, end: toImage(point) };
      else if (s.kind === 'angle') state = { ...s, cursor: toImage(point) };
      else if (s.kind === 'handle' && s.id === id) {
        const target = store()
          .list(studyId)
          .find((a) => a.id === s.target);
        if (!target) return true;
        const points = moveHandle(
          { kind: target.kind, points: s.points },
          s.handle,
          toImage(point),
        );
        state = { ...s, points };
      } else return false;
      schedule();
      return true;
    },
    hover(point) {
      if (disposed || state.kind !== 'angle' || state.points.length === 0) return;
      state = { ...state, cursor: toImage(point) };
      schedule();
    },
    pointerUp(id, point) {
      if (disposed) return false;
      const s = state;
      if (s.kind === 'handle' && s.id === id) {
        flush();
        state = { kind: 'idle' };
        return true;
      }
      if (s.kind === 'drag' && s.id === id) {
        const end = toImage(point);
        finish();
        if (canvasDistance(s.from, point) >= CLICK_TOLERANCE) {
          store().add(studyId, { kind: s.tool, points: [s.start, end], spacing });
        }
        return true;
      }
      if (s.kind !== 'angle' || s.press?.id !== id) return false;
      const up = toImage(point);
      // The first press may be a click (arm end) or a drag that draws the first arm.
      const dragged = canvasDistance(s.press.from, point) >= CLICK_TOLERANCE;
      const points =
        s.points.length === 0 ? (dragged ? [toImage(s.press.from), up] : [up]) : [...s.points, up];
      if (points.length >= POINTS_NEEDED.angle) {
        finish();
        store().add(studyId, { kind: 'angle', points: points.slice(0, 3), spacing });
        return true;
      }
      state = { kind: 'angle', points, cursor: up, press: null };
      flush();
      return true;
    },
    keyDown(key) {
      if (disposed) return false;
      if (key === 'Escape' && state.kind !== 'idle') {
        cancel();
        return true;
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (state.kind !== 'idle') cancel();
        return store().removeSelected(studyId);
      }
      return false;
    },
    cancel: () => {
      if (!disposed) cancel();
    },
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
    },
  };
}
