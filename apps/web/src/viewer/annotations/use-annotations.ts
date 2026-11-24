import { useAnnotationStore, type Draft } from './annotation-store';
import type { Annotation } from './measure-math';

const EMPTY: Annotation[] = [];

/** One study's annotations, its selected id and its in-progress draft (if any). */
export function useAnnotations(studyId: string): {
  annotations: Annotation[];
  selectedId: string | null;
  draft: Draft | null;
} {
  const annotations = useAnnotationStore((s) => s.byStudy[studyId] ?? EMPTY);
  const selectedId = useAnnotationStore((s) =>
    s.selected?.studyId === studyId ? s.selected.id : null,
  );
  const draft = useAnnotationStore((s) => (s.draft?.studyId === studyId ? s.draft : null));
  return { annotations, selectedId, draft };
}
