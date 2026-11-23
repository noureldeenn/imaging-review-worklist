import { ImageOff, LoaderCircle } from 'lucide-react';
import { useDicomViewer } from './use-dicom-viewer';
import { ViewerControls } from './viewer-controls';
import { ViewerMetadata } from './viewer-metadata';

export function StudyViewer({ studyId }: { studyId: string }) {
  const { containerRef, state, error, metadata, windowLevel, setWindowLevel, resetView } =
    useDicomViewer(studyId);
  return (
    <div className="study-viewer overflow-hidden rounded-lg border bg-viewer">
      <ViewerControls
        windowLevel={windowLevel}
        disabled={state !== 'ready'}
        onWindowLevel={setWindowLevel}
        onReset={resetView}
      />
      {/* Overlays are siblings of the viewport, never children, and nothing here animates
          transforms or opacity: Cornerstone owns the viewport and sizes its canvas to it. */}
      <div className="relative">
        {/* Cornerstone owns this element's children (its canvas); React renders none. */}
        <div
          ref={containerRef}
          className="viewport relative h-[min(60vh,420px)] sm:h-[clamp(280px,58vh,620px)] w-full overflow-hidden bg-viewer"
          data-testid="viewport"
          role="img"
          aria-label={`DICOM image for ${studyId}`}
        />
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
      {state === 'ready' && metadata && <ViewerMetadata metadata={metadata} />}
    </div>
  );
}
