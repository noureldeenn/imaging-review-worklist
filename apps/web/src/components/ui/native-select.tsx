import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn's NativeSelect styling. The Radix Select is deliberately not used for
// the filters and reviewer switcher: a real <select> keeps native keyboard and
// screen-reader behaviour and the existing label/option tests unchanged.
function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-9 w-full min-w-0 appearance-none rounded-md font-normal max-[899px]:h-11 border border-input bg-background/60 py-1 pr-8 pl-3 text-sm text-foreground transition-[border-color,box-shadow] outline-none hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed [&>option]:bg-popover',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
