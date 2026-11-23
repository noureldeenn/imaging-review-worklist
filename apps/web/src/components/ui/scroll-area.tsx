import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// API-compatible stand-in for shadcn's ScrollArea. Radix ScrollArea needs
// ResizeObserver at mount (absent in jsdom) and replaces native scrolling; a
// styled native scroller keeps keyboard/wheel behaviour and the tests simple.
function ScrollArea({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="scroll-area"
      className={cn(
        'relative overflow-y-auto overscroll-contain [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
