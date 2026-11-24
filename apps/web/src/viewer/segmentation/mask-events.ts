import type { Rect } from './seg-types';

/**
 * Non-React channels of the segmentation: mask-change notifications for the
 * overlay (dirty rectangles) and the stroke in progress per study, so that
 * deleting a segment or clearing mid-stroke can cancel (restore) it first.
 */
const listeners = new Map<string, Set<(rect: Rect | null) => void>>();
const strokes = new Map<string, () => void>();

/** Overlay subscription: `rect` is the changed area, null means redraw everything. */
export function subscribeMask(studyId: string, cb: (rect: Rect | null) => void): () => void {
  const set = listeners.get(studyId) ?? new Set();
  set.add(cb);
  listeners.set(studyId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(studyId);
  };
}

export function notifyMask(studyId: string, rect: Rect | null): void {
  listeners.get(studyId)?.forEach((cb) => cb(rect));
}

/** The painting registers its stroke; returns the unregister function. */
export function registerStroke(studyId: string, cancel: () => void): () => void {
  strokes.set(studyId, cancel);
  return () => {
    if (strokes.get(studyId) === cancel) strokes.delete(studyId);
  };
}

/** Cancels (and restores) the study's stroke in progress, if any. */
export const cancelStroke = (studyId: string): void => strokes.get(studyId)?.();

/** Test helper. */
export function resetMaskEvents(): void {
  listeners.clear();
  strokes.clear();
}
