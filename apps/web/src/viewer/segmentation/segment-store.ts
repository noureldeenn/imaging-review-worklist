import { create } from 'zustand';
import type { Spacing } from '../annotations/measure-math';
import { createMaskMemory, packDiff, restoreDiff, type MaskEntry } from './mask-memory';
import { countLabels } from './seg-math';
import {
  BRUSH_DEFAULT,
  DROPPED_NOTICE,
  MAX_SEGMENTS,
  OPACITY_DEFAULT,
  PALETTE,
  PRESETS,
  SEGMENT_LIMIT_NOTICE,
  TOO_LARGE_NOTICE,
  type PresetId,
  type Range,
  type Rect,
  type Segment,
} from './seg-types';

export type StudySegments = {
  segments: Segment[];
  activeId: string | null;
  /** Segments ever created since the last clear (default names keep counting). */
  created: number;
  /** Strokes that `Undo last stroke` can revert. */
  undoDepth: number;
  /** Bumped on every mask change (area readouts recompute). */
  revision: number;
  /** The mask was evicted by the memory budget; shown until the next paint. */
  dropped: boolean;
};

/** What the panel needs from the loaded image (set by the lazy viewer; no Cornerstone here). */
export type ImageInfo = { spacing: Spacing | null; ct: boolean };

type SegmentState = {
  byStudy: Record<string, StudySegments>;
  imageInfo: Record<string, ImageInfo>;
  brushSize: number;
  opacity: number;
  preset: PresetId;
  custom: Range;
  /** Refusals (too large, limit); `at` tells repeats apart. */
  status: { studyId: string; text: string; at: number } | null;
  /** Panel announcements; a new key makes a repeated text be read again. */
  announcement: { text: string; key: number };
  study(studyId: string): StudySegments;
  addSegment(studyId: string): Segment | null;
  renameSegment(studyId: string, id: string, name: string): void;
  setActive(studyId: string, id: string): void;
  toggleVisible(studyId: string, id: string): void;
  removeSegment(studyId: string, id: string): void;
  clear(studyId: string): void;
  undo(studyId: string): boolean;
  /** The mask and the label to write (0 for the eraser); null when refused or nothing to erase. */
  prepareStroke(
    studyId: string,
    width: number,
    height: number,
    erase?: boolean,
  ): { mask: Uint8Array; width: number; label: number } | null;
  /** Records a finished stroke for undo (no-op when nothing changed). */
  commitStroke(studyId: string, diff: Map<number, number>, rect: Rect | null): void;
  setBrushSize(size: number): void;
  setOpacity(opacity: number): void;
  setPreset(preset: PresetId): void;
  setCustom(range: Partial<Range>): void;
  announce(text: string): void;
  /** Shows a refusal in the study's status region. */
  notice(studyId: string, text: string): void;
  setImageInfo(studyId: string, info: ImageInfo): void;
};

const EMPTY: StudySegments = {
  segments: [],
  activeId: null,
  created: 0,
  undoDepth: 0,
  revision: 0,
  dropped: false,
};

let memory = createMaskMemory();
const listeners = new Map<string, Set<(rect: Rect | null) => void>>();
let nextId = 0;

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

/** The study's mask without touching the LRU order (overlay, areas). */
export const getMask = (studyId: string): MaskEntry | undefined => memory.get(studyId);

/** Pixel count per label of the study's mask (empty when there is none). */
export function segmentAreas(studyId: string): Map<number, number> {
  const entry = memory.get(studyId);
  if (!entry) return new Map();
  const counts = countLabels(entry.mask);
  return new Map(Array.from(counts.slice(1), (n, k) => [k + 1, n] as [number, number]));
}

/** The smart brush's gate: the preset's range for CT, the custom range otherwise. */
export function smartRange(state: Pick<SegmentState, 'preset' | 'custom'>, ct: boolean): Range {
  const preset = ct ? PRESETS.find((p) => p.id === state.preset)?.range : null;
  return preset ?? state.custom;
}

/** Text of the Segments panel's always-mounted status region for one study. */
export function statusFor(state: SegmentState, studyId: string): string {
  const s = state.study(studyId);
  if (s.dropped) return DROPPED_NOTICE;
  if (state.status?.studyId === studyId) return state.status.text;
  return s.segments.length >= MAX_SEGMENTS ? SEGMENT_LIMIT_NOTICE : '';
}

/**
 * Segments per study, in memory only (never persisted; a reload clears them).
 * The masks live outside React state in a budgeted LRU (`mask-memory`); this
 * store holds the segment list, the panel settings and revision counters.
 */
export const useSegmentStore = create<SegmentState>((set, get) => {
  const patch = (studyId: string, change: Partial<StudySegments>) =>
    set({ byStudy: { ...get().byStudy, [studyId]: { ...get().study(studyId), ...change } } });
  const refuse = (studyId: string, text: string) => {
    nextId += 1;
    set({ status: { studyId, text, at: nextId } });
  };
  const bump = (studyId: string, change: Partial<StudySegments> = {}) => {
    const s = get().study(studyId);
    patch(studyId, { revision: s.revision + 1, ...change });
  };
  const markDropped = (ids: string[]) => {
    ids.forEach((id) => {
      patch(id, { ...EMPTY, dropped: true });
      notifyMask(id, null);
    });
  };
  const add = (studyId: string): Segment | null => {
    const s = get().study(studyId);
    if (s.segments.length >= MAX_SEGMENTS) {
      refuse(studyId, SEGMENT_LIMIT_NOTICE);
      return null;
    }
    const used = new Set(s.segments.map((x) => x.label));
    const label = [1, 2, 3, 4, 5, 6, 7, 8].find((l) => !used.has(l)) ?? 1;
    nextId += 1;
    const segment: Segment = {
      id: `seg${nextId}`,
      label,
      name: `Segment ${s.created + 1}`,
      color: PALETTE[label - 1] ?? '#ef4444',
      visible: true,
    };
    patch(studyId, {
      segments: [...s.segments, segment],
      activeId: segment.id,
      created: s.created + 1,
    });
    return segment;
  };
  const mapSegment = (studyId: string, id: string, fn: (s: Segment) => Segment) => {
    const s = get().study(studyId);
    patch(studyId, { segments: s.segments.map((x) => (x.id === id ? fn(x) : x)) });
    notifyMask(studyId, null);
  };

  return {
    byStudy: {},
    imageInfo: {},
    brushSize: BRUSH_DEFAULT,
    opacity: OPACITY_DEFAULT,
    preset: 'adipose',
    custom: { min: 0, max: 1000 },
    status: null,
    announcement: { text: '', key: 0 },
    study: (studyId) => get().byStudy[studyId] ?? EMPTY,
    addSegment: add,
    renameSegment: (studyId, id, name) => mapSegment(studyId, id, (x) => ({ ...x, name })),
    setActive: (studyId, id) => patch(studyId, { activeId: id }),
    toggleVisible: (studyId, id) => mapSegment(studyId, id, (x) => ({ ...x, visible: !x.visible })),
    removeSegment(studyId, id) {
      const s = get().study(studyId);
      const index = s.segments.findIndex((x) => x.id === id);
      const target = s.segments[index];
      if (!target) return;
      const entry = memory.get(studyId);
      if (entry) {
        const { mask } = entry;
        for (let i = 0; i < mask.length; i += 1) if (mask[i] === target.label) mask[i] = 0;
        // Older diffs could bring the deleted label back: undo starts afresh.
        memory.clearUndo(studyId);
      }
      const segments = s.segments.filter((x) => x.id !== id);
      const neighbour = segments[index] ?? segments[index - 1] ?? null;
      const activeId = s.activeId === id ? (neighbour?.id ?? null) : s.activeId;
      bump(studyId, { segments, activeId, undoDepth: 0 });
      notifyMask(studyId, null);
    },
    clear(studyId) {
      memory.delete(studyId);
      patch(studyId, { ...EMPTY, revision: get().study(studyId).revision + 1 });
      if (get().status?.studyId === studyId) set({ status: null });
      get().announce('Segments cleared');
      notifyMask(studyId, null);
    },
    undo(studyId) {
      const entry = memory.get(studyId);
      const diff = memory.popUndo(studyId);
      if (!entry || !diff) return false;
      restoreDiff(entry.mask, diff);
      bump(studyId, { undoDepth: entry.undo.length });
      notifyMask(studyId, diff.rect);
      return true;
    },
    prepareStroke(studyId, width, height, erase = false) {
      if (erase) {
        const existing = memory.get(studyId);
        if (!existing || existing.width !== width || existing.height !== height) return null;
        return { mask: existing.mask, width, label: 0 };
      }
      const result = memory.ensure(studyId, width, height);
      if ('tooLarge' in result) {
        refuse(studyId, TOO_LARGE_NOTICE);
        return null;
      }
      markDropped(result.dropped);
      let s = get().study(studyId);
      if (s.dropped) patch(studyId, { dropped: false });
      let active = s.segments.find((x) => x.id === s.activeId) ?? s.segments[0];
      if (!active) {
        const created = add(studyId);
        if (!created) return null;
        active = created;
      }
      s = get().study(studyId);
      if (s.activeId !== active.id) patch(studyId, { activeId: active.id });
      // Painting into a hidden segment would be invisible: show it.
      if (!active.visible) mapSegment(studyId, active.id, (x) => ({ ...x, visible: true }));
      return { mask: result.entry.mask, width, label: active.label };
    },
    commitStroke(studyId, diff, rect) {
      if (diff.size === 0) return;
      const dropped = memory.pushUndo(studyId, packDiff(diff, rect));
      markDropped(dropped);
      bump(studyId, { undoDepth: memory.get(studyId)?.undo.length ?? 0 });
    },
    setBrushSize: (brushSize) => set({ brushSize }),
    setOpacity: (opacity) => set({ opacity }),
    setPreset: (preset) => set({ preset }),
    setCustom: (range) => set({ custom: { ...get().custom, ...range } }),
    announce: (text) => set({ announcement: { text, key: get().announcement.key + 1 } }),
    notice: refuse,
    setImageInfo: (studyId, info) => set({ imageInfo: { ...get().imageInfo, [studyId]: info } }),
  };
});

/** Test helper: empty store and masks (optionally with a different memory budget). */
export function resetSegmentation(budget?: number): void {
  memory = createMaskMemory(budget);
  listeners.clear();
  useSegmentStore.setState(useSegmentStore.getInitialState(), true);
}
