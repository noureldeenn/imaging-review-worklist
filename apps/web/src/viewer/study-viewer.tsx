import { useDicomViewer } from "./use-dicom-viewer";
import { ViewerControls } from "./viewer-controls";
import { ViewerMetadata } from "./viewer-metadata";

export function StudyViewer({ studyId }: { studyId: string }) {
  const viewer = useDicomViewer(studyId);
  return (
    <div className="study-viewer">
      <ViewerControls
        windowLevel={viewer.windowLevel}
        disabled={viewer.state !== "ready"}
        onWindowLevel={viewer.setWindowLevel}
        onReset={viewer.resetView}
      />
      {/* Cornerstone owns this element's children (its canvas); React renders none. */}
      <div
        ref={viewer.containerRef}
        className="viewport"
        data-testid="viewport"
        role="img"
        aria-label={`DICOM image for ${studyId}`}
      />
      {viewer.state === "loading" && <p role="status">Loading image…</p>}
      {viewer.state === "error" && <p role="alert">{viewer.error}</p>}
      {viewer.state === "ready" && viewer.metadata && <ViewerMetadata metadata={viewer.metadata} />}
    </div>
  );
}
