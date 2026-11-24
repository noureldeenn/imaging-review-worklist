import type { ImageMapper } from '../annotations/annotation-geometry';
import type { PointerInput } from '../annotations/annotation-drawing';
import type { Point } from '../annotations/measure-math';
import { createDiffRecorder, type DiffRecorder } from './mask-memory';
import {
  makeGate,
  stampDisc,
  strokePoints,
  unionRect,
  type GateMode,
  type PixelSource,
} from './seg-math';
import { COLOR_IMAGE_NOTICE, isSegmentationTool, type Rect } from './seg-types';
import { notifyMask, registerStroke, smartRange, useSegmentStore } from './segment-store';

type Scheduler = { request(cb: () => void): number; cancel(handle: number): void };

type Stroke = {
  id: number;
  last: Point;
  mask: Uint8Array;
  label: number;
  radius: number;
  gate: ((index: number) => boolean) | undefined;
  diff: DiffRecorder;
  /** Unregisters the stroke from the store (delete/clear cancel it). */
  release(): void;
  /** Changed since the last overlay notification. */
  dirty: Rect | null;
  /** Everything the stroke touched (undo / cancel redraw). */
  touched: Rect | null;
};

/**
 * Pointer/keyboard state machine of the brush, smart brush and eraser for ONE
 * loaded image. Like the measurement drawing it has no listeners of its own:
 * the viewport's existing handlers feed it. One stroke = press to release;
 * Escape, a second pointer, a tool switch and dispose cancel it and restore
 * the mask. After `dispose()` every method is a no-op.
 */
export type SegPainting = {
  pointerDown(input: PointerInput): boolean;
  pointerMove(id: number, point: Point): boolean;
  pointerUp(id: number, point: Point): boolean;
  keyDown(key: string): boolean;
  /** Ctrl/Cmd+Z: cancels a stroke in progress, else reverts the last stroke. */
  undo(): boolean;
  cancel(): void;
  dispose(): void;
};

type Options = {
  studyId: string;
  /** Columns x rows of the image (the mask size); null: painting is unavailable. */
  imageSize: { width: number; height: number } | null;
  mapper: ImageMapper;
  /** Greyscale pixel values for the smart brush; null for colour images. */
  getPixels(): PixelSource | null;
  /** 'hu' for CT (stored x slope + intercept), 'stored' for every other modality. */
  gateMode: GateMode;
  scheduler?: Scheduler;
};

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createSegPainting({
  studyId,
  imageSize,
  mapper,
  getPixels,
  gateMode,
  scheduler = browserScheduler,
}: Options): SegPainting {
  const store = () => useSegmentStore.getState();
  let stroke: Stroke | null = null;
  let disposed = false;
  let frame: number | null = null;
  const width = imageSize?.width ?? 0;
  const height = imageSize?.height ?? 0;

  const cancelFrame = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
  };
  // The overlay redraws only the changed rectangle, at most once per frame.
  const flush = () => {
    cancelFrame();
    if (stroke?.dirty) notifyMask(studyId, stroke.dirty);
    if (stroke) stroke.dirty = null;
  };
  const schedule = () => {
    frame ??= scheduler.request(() => {
      frame = null;
      if (!disposed) flush();
    });
  };
  const stamp = (s: Stroke, p: Point) => {
    const rect = stampDisc(s.mask, width, height, p, s.radius, s.label, {
      gate: s.gate,
      diff: s.diff,
    });
    if (!rect) return;
    s.dirty = unionRect(s.dirty, rect);
    s.touched = unionRect(s.touched, rect);
  };
  const moveTo = (s: Stroke, point: Point) => {
    const p = mapper.toImage(point);
    for (const q of strokePoints(s.last, p, s.radius)) stamp(s, q);
    s.last = p;
  };
  const cancel = () => {
    cancelFrame();
    const s = stroke;
    stroke = null;
    if (!s) return;
    s.release();
    if (s.diff.size() === 0) return;
    s.diff.restore(s.mask);
    notifyMask(studyId, s.touched);
  };
  const begin = ({ id, point, tool }: PointerInput): boolean => {
    if (!imageSize) return true;
    let gate: Stroke['gate'];
    if (tool === 'smartBrush') {
      const pixels = getPixels();
      if (!pixels || pixels.data.length < width * height) {
        store().notice(studyId, COLOR_IMAGE_NOTICE);
        return true;
      }
      gate = makeGate(pixels, smartRange(store(), gateMode === 'hu'), gateMode);
    }
    const target = store().prepareStroke(studyId, width, height, tool === 'eraser');
    if (!target) return true;
    const start = mapper.toImage(point);
    stroke = {
      id,
      last: start,
      mask: target.mask,
      label: target.label,
      radius: store().brushSize,
      gate,
      diff: createDiffRecorder(width * height),
      dirty: null,
      touched: null,
      // Deleting a segment or clearing mid-stroke cancels (restores) it first.
      release: registerStroke(studyId, () => cancel()),
    };
    stamp(stroke, start);
    schedule();
    return true;
  };

  return {
    pointerDown(input) {
      if (disposed || !isSegmentationTool(input.tool)) return false;
      if (stroke) cancel();
      return begin(input);
    },
    pointerMove(id, point) {
      if (disposed || stroke?.id !== id) return false;
      moveTo(stroke, point);
      schedule();
      return true;
    },
    pointerUp(id, point) {
      if (disposed || stroke?.id !== id) return false;
      const s = stroke;
      moveTo(s, point);
      flush();
      stroke = null;
      s.release();
      store().commitStroke(studyId, s.diff.pack(s.touched));
      return true;
    },
    keyDown(key) {
      if (disposed || key !== 'Escape' || !stroke) return false;
      cancel();
      return true;
    },
    undo() {
      if (disposed) return false;
      if (stroke) {
        cancel();
        return true;
      }
      return store().undo(studyId);
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
