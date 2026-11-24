import { create } from 'zustand';
import type { Annotation, MeasurementKind, Point, Spacing } from './measure-math';

/** Most annotations one study may hold (drawing more is refused). */
export const MAX_ANNOTATIONS = 100;

/** The shape being drawn right now (preview only; not in any list yet). */
export type Draft = { studyId: string; kind: MeasurementKind; points: Point[] };

type NewAnnotation = { kind: MeasurementKind; points: Point[]; spacing: Spacing | null };

type AnnotationState = {
  byStudy: Record<string, Annotation[]>;
  selected: { studyId: string; id: string } | null;
  draft: Draft | null;
  list(studyId: string): Annotation[];
  selectedIn(studyId: string): string | null;
  /** Returns the new id, or null when the study already holds MAX_ANNOTATIONS. */
  add(studyId: string, annotation: NewAnnotation): string | null;
  update(studyId: string, id: string, points: Point[]): void;
  remove(studyId: string, id: string): void;
  /** Deletes the study's selected annotation; false when nothing was selected. */
  removeSelected(studyId: string): boolean;
  clear(studyId: string): void;
  select(studyId: string, id: string | null): void;
  setDraft(draft: Draft | null): void;
};

const EMPTY: Annotation[] = [];
let nextId = 0;

/**
 * Measurements per study, in memory only: never written to localStorage or
 * the server, so a reload clears them. Points are image pixel coordinates.
 */
export const useAnnotationStore = create<AnnotationState>((set, get) => {
  const without = (studyId: string, keep: (a: Annotation) => boolean) => {
    const { byStudy, selected } = get();
    const next = (byStudy[studyId] ?? EMPTY).filter(keep);
    const stillSelected =
      selected?.studyId === studyId && !next.some((a) => a.id === selected.id) ? null : selected;
    set({ byStudy: { ...byStudy, [studyId]: next }, selected: stillSelected });
  };
  return {
    byStudy: {},
    selected: null,
    draft: null,
    list: (studyId) => get().byStudy[studyId] ?? EMPTY,
    selectedIn: (studyId) => {
      const s = get().selected;
      return s?.studyId === studyId ? s.id : null;
    },
    add(studyId, annotation) {
      const current = get().list(studyId);
      if (current.length >= MAX_ANNOTATIONS) return null;
      nextId += 1;
      const id = `m${nextId}`;
      set({ byStudy: { ...get().byStudy, [studyId]: [...current, { ...annotation, id }] } });
      return id;
    },
    update(studyId, id, points) {
      const current = get().list(studyId);
      if (!current.some((a) => a.id === id)) return;
      set({
        byStudy: {
          ...get().byStudy,
          [studyId]: current.map((a) => (a.id === id ? { ...a, points } : a)),
        },
      });
    },
    remove: (studyId, id) => without(studyId, (a) => a.id !== id),
    removeSelected(studyId) {
      const id = get().selectedIn(studyId);
      if (id === null) return false;
      without(studyId, (a) => a.id !== id);
      return true;
    },
    clear: (studyId) => without(studyId, () => false),
    select: (studyId, id) => set({ selected: id === null ? null : { studyId, id } }),
    setDraft: (draft) => set({ draft }),
  };
});

/** Test helper: back to an empty store. */
export function resetAnnotations(): void {
  useAnnotationStore.setState({ byStudy: {}, selected: null, draft: null });
}
