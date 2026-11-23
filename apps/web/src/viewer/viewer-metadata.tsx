import type { ViewerMetadataValue } from './viewer-session';

export function ViewerMetadata({ metadata }: { metadata: ViewerMetadataValue }) {
  const { modality, studyDate, rows, columns } = metadata;
  return (
    <p className="viewer-metadata border-t bg-card px-3 py-1.5 font-mono text-xs break-words text-muted-foreground">
      File metadata: {modality} · {studyDate} · {rows}×{columns}
    </p>
  );
}
