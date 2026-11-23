import { cn } from '@/lib/utils';

/** "reviewer-a" -> "A": the last id segment's first letter. */
export function ownerInitial(ownerId: string): string {
  const last =
    ownerId
      .split(/[-_\s]/)
      .filter(Boolean)
      .pop() ?? ownerId;
  return (last[0] ?? '?').toUpperCase();
}

/** Decorative initial avatar; the owner is always also named in text nearby. */
export function OwnerAvatar({ ownerId, className }: { ownerId: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-[10px] font-semibold text-primary ring-1 ring-primary/30',
        className,
      )}
    >
      {ownerInitial(ownerId)}
    </span>
  );
}
