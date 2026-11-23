import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-xs leading-none font-medium text-muted-foreground select-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
