import { useDicomViewer } from './use-dicom-viewer';
import { ViewerControls } from './viewer-controls';
import { ViewerMetadata } from './viewer-metadata';

export function StudyViewer({ studyId }: { studyId: string }) {
  const { containerRef, state, error, metadata, windowLevel, setWindowLevel, resetView } =
    useDicomViewer(studyId);
  return (
    <div className="study-viewer">
      <ViewerControls
        windowLevel={windowLevel}
        disabled={state !== 'ready'}
        onWindowLevel={setWindowLevel}
        onReset={resetView}
      />
      {/* Cornerstone owns this element's children (its canvas); React renders none. */}
      <div
        ref={containerRef}
        className="viewport"
        data-testid="viewport"
        role="img"
        aria-label={`DICOM image for ${studyId}`}
      />
      {state === 'loading' && <p role="status">Loading image…</p>}
      {state === 'error' && <p role="alert">{error}</p>}
      {state === 'ready' && metadata && <ViewerMetadata metadata={metadata} />}
    </div>
  );
}
