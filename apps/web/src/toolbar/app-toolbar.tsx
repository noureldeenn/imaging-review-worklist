import type { LayoutState } from '../layout/use-layout-state';
import { NARROW_QUERY, useMediaQuery } from '../lib/viewport';
import { useAnnotationStore } from '../viewer/annotations/annotation-store';
import { useViewerBridge } from '../viewer/viewer-bridge';
import { TOOLBAR_GROUPS, resolveToolbar } from './toolbar-config';
import type { MeasurementsContext } from './toolbar-types';
import { Toolbar } from './toolbar';

/** The current study's measurement state and actions, straight from the in-memory store. */
function useMeasurementsContext(studyId: string | null): MeasurementsContext {
  const count = useAnnotationStore((s) => (studyId ? (s.byStudy[studyId]?.length ?? 0) : 0));
  const hasSelection = useAnnotationStore(
    (s) => studyId !== null && s.selected?.studyId === studyId,
  );
  return {
    count,
    hasSelection,
    deleteSelected: () => {
      if (studyId) useAnnotationStore.getState().removeSelected(studyId);
    },
    clear: () => {
      if (studyId) useAnnotationStore.getState().clear(studyId);
    },
  };
}

/** The app's toolbar row: config resolved against the layout and the mounted viewer. */
export function AppToolbar({
  layout,
  studyId = null,
}: {
  layout: LayoutState & { reviewAttention: boolean };
  studyId?: string | null;
}) {
  const commands = useViewerBridge((s) => s.commands);
  const ready = useViewerBridge((s) => s.ready);
  const view = useViewerBridge((s) => s.view);
  const narrow = useMediaQuery(NARROW_QUERY, false);
  const measurements = useMeasurementsContext(studyId);
  const groups = resolveToolbar(
    TOOLBAR_GROUPS,
    { viewer: ready ? commands : null, view, layout, measurements },
    { narrow },
  );
  return <Toolbar groups={groups} label="Image tools" />;
}
