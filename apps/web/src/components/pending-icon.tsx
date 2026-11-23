import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Button icon that becomes a spinner while a request is pending. Both icons stay
 * mounted and only their class toggles, so pending state never adds or removes
 * DOM nodes (observers and screen readers see a stable button).
 */
export function PendingIcon({ pending, icon: Icon }: { pending: boolean; icon: LucideIcon }) {
  return (
    <>
      <LoaderCircle aria-hidden="true" className={cn('animate-spin', !pending && 'hidden')} />
      <Icon aria-hidden="true" className={cn(pending && 'hidden')} />
    </>
  );
}
