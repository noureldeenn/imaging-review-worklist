import type { ViewerMetadataValue } from './viewer-session';

export function ViewerMetadata({ metadata }: { metadata: ViewerMetadataValue }) {
  const { modality, studyDate, rows, columns } = metadata;
  return (
    <p className="viewer-metadata font-mono text-[11px] break-words text-muted-foreground">
      File metadata: {modality} · {studyDate} · {rows}×{columns}
    </p>
  );
}
