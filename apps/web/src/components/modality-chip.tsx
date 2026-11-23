import { cn } from '@/lib/utils';

/** Compact monospace chip for a DICOM modality code (CT, MR, ...). */
export function ModalityChip({ modality, className }: { modality: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-8 items-center justify-center rounded border border-border bg-secondary px-1.5 font-mono text-[11px] font-semibold tracking-wide text-secondary-foreground',
        className,
      )}
    >
      {modality}
    </span>
  );
}
