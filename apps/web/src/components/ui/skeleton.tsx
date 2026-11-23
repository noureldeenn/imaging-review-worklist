import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn Skeleton with a shimmer sweep instead of the default pulse; the shimmer
// is switched off under prefers-reduced-motion (see globals.css).
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_0%,var(--accent)_50%,var(--muted)_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
