import { CircleCheck, CircleDashed, CircleDot, type LucideIcon } from 'lucide-react';
import type { StudyStatus } from '../api/schemas';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONES: Record<StudyStatus, { icon: LucideIcon; className: string }> = {
  Unassigned: {
    icon: CircleDashed,
    className: 'border-status-unassigned/20 bg-status-unassigned/10 text-status-unassigned',
  },
  InReview: {
    icon: CircleDot,
    className: 'border-status-review/25 bg-status-review/12 text-status-review',
  },
  Completed: {
    icon: CircleCheck,
    className: 'border-status-done/25 bg-status-done/12 text-status-done',
  },
};

/** Status pill: icon + text, so the state never relies on colour alone. */
export function StatusBadge({ status, className }: { status: StudyStatus; className?: string }) {
  const { icon: Icon, className: tone } = TONES[status];
  return (
    <Badge
      variant="outline"
      aria-label={status}
      data-status={status}
      className={cn('gap-1 font-medium', tone, className)}
    >
      <Icon aria-hidden="true" />
      {status}
    </Badge>
  );
}
