import { ImageOff, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { AnnotationOverlay } from './annotations/annotation-overlay';
import { useDicomViewer } from './use-dicom-viewer';
import { useInfoStripOffset } from './use-info-strip-offset';
import { useViewerBridge, type ViewerCommands } from './viewer-bridge';
import { ViewerControls } from './viewer-controls';
import { ZOOM_STEP } from './viewer-math';
import { ViewerMetadata } from './viewer-metadata';
import { ViewerReadout } from './viewer-readout';
import {
  ARIA_KEYSHORTCUTS,
  SHORTCUTS_DESCRIPTION_ID,
  ShortcutsDescription,
  ShortcutsHelp,
} from './viewer-shortcuts';

/**
 * Full-bleed viewer: the viewport fills all the space it is given (Cornerstone
 * fits the image to it and the ResizeObserver refits on size changes), with a
 * slim info strip below it. The app toolbar drives it through the viewer bridge.
 */
export function StudyViewer({ studyId }: { studyId: string }) {
  const viewer = useDicomViewer(studyId);
  const { containerRef, state, error, metadata, windowLevel, view } = viewer;
  const { setTool, zoomBy, rotateBy, flipH, flipV, toggleInvert, reset } = viewer;
  const ready = state === 'ready';
  const stripRef = useRef<HTMLDivElement>(null);
  useInfoStripOffset(stripRef);

  const commands = useMemo<ViewerCommands>(
    () => ({
      setTool,
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      rotateLeft: () => rotateBy(-90),
      rotateRight: () => rotateBy(90),
      flipH,
      flipV,
      toggleInvert,
      reset,
    }),
    [setTool, zoomBy, rotateBy, flipH, flipV, toggleInvert, reset],
  );

  const publish = useViewerBridge((s) => s.publish);
  const clear = useViewerBridge((s) => s.clear);
  useEffect(() => publish({ commands, ready, view }), [publish, commands, ready, view]);
  useEffect(() => clear, [clear]);

  return (
    <div className="study-viewer flex h-full min-h-0 flex-col bg-viewer">
      <ShortcutsDescription />
      {/* Overlays are siblings of the viewport, never children, and nothing here animates
          transforms or opacity: Cornerstone owns the viewport and sizes its canvas to it. */}
      <div className="relative min-h-0 flex-1 border border-primary/45">
        {/* Cornerstone owns this element's children (its canvas); React renders none. */}
        <div
          ref={containerRef}
          className="viewport absolute inset-0 touch-none overflow-hidden bg-viewer outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          data-testid="viewport"
          role="img"
          aria-label={`DICOM image for ${studyId}`}
          aria-describedby={SHORTCUTS_DESCRIPTION_ID}
          aria-keyshortcuts={ARIA_KEYSHORTCUTS}
          tabIndex={0}
        />
        {ready && (
          <AnnotationOverlay studyId={studyId} revision={view} getMapper={viewer.getMapper} />
        )}
        {state === 'loading' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p
              role="status"
              className="flex items-center gap-2 rounded-md border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              Loading image…
            </p>
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive"
              >
                <ImageOff className="size-5" />
              </span>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            </div>
          </div>
        )}
      </div>
      <div
        ref={stripRef}
        className="viewer-info flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 bg-black px-3 py-1.5 max-[899px]:px-3 max-[899px]:pb-1"
      >
        {ready && metadata && <ViewerMetadata metadata={metadata} />}
        {ready && <ViewerReadout view={view} />}
        <div className="ml-auto flex min-w-0 items-center gap-3 max-[899px]:ml-0 max-[899px]:basis-full">
          <ViewerControls
            windowLevel={windowLevel}
            disabled={!ready}
            onWindowLevel={viewer.setWindowLevel}
          />
          <ShortcutsHelp />
        </div>
      </div>
    </div>
  );
}
