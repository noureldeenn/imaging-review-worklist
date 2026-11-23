import type { ViewerMetadataValue } from "./viewer-session";

export function ViewerMetadata({ metadata }: { metadata: ViewerMetadataValue }) {
  const { modality, studyDate, rows, columns } = metadata;
  return (
    <p className="viewer-metadata">
      File metadata: {modality} · {studyDate} · {columns}×{rows}
    </p>
  );
}
