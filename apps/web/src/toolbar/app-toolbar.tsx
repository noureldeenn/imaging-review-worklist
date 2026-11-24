import type { LayoutState } from '../layout/use-layout-state';
import { NARROW_QUERY, useMediaQuery } from '../lib/viewport';
import { useViewerBridge } from '../viewer/viewer-bridge';
import { TOOLBAR_GROUPS, resolveToolbar } from './toolbar-config';
import { Toolbar } from './toolbar';

/** The app's toolbar row: config resolved against the layout and the mounted viewer. */
export function AppToolbar({ layout }: { layout: LayoutState & { reviewAttention: boolean } }) {
  const commands = useViewerBridge((s) => s.commands);
  const ready = useViewerBridge((s) => s.ready);
  const view = useViewerBridge((s) => s.view);
  const narrow = useMediaQuery(NARROW_QUERY, false);
  const groups = resolveToolbar(
    TOOLBAR_GROUPS,
    { viewer: ready ? commands : null, view, layout },
    { narrow },
  );
  return <Toolbar groups={groups} label="Image tools" />;
}
