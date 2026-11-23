import { CircleCheck, Hand, Lock } from 'lucide-react';
import type { StudyDto } from '../api/schemas';
import { CardContent, CardHeader } from './ui/card';

/** "you" when the id is the current reviewer, otherwise the id (same rule as the Owner line). */
function who(ownerId: string | null, reviewerId: string): string {
  if (ownerId === null) return 'unknown';
  return ownerId === reviewerId ? 'you' : ownerId;
}

/** Read-only card for a completed study's saved note; visible to every reviewer. */
export function SavedReviewNote({
  study,
  note,
  reviewerId,
}: {
  study: StudyDto;
  note: string;
  reviewerId: string;
}) {
  return (
    <section
      aria-label="Saved review note"
      className="animate-panel-in rounded-lg border bg-card text-card-foreground"
    >
      <CardHeader className="flex-row items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Review note</h3>
        <p className="flex items-center gap-1.5 text-xs text-status-done">
          <CircleCheck aria-hidden="true" className="size-3.5" />
          {`Completed by ${who(study.ownerId, reviewerId)}`}
        </p>
      </CardHeader>
      <CardContent>
        <blockquote className="border-l-2 border-primary/50 pl-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
          {note}
        </blockquote>
      </CardContent>
    </section>
  );
}

/** One-line explanation for states where the current reviewer cannot write a note. */
export function ReviewNoteHint({ study, reviewerId }: { study: StudyDto; reviewerId: string }) {
  let icon = Hand;
  let text: string | null = null;
  if (study.status === 'Unassigned') {
    text = 'Claim this study to write a review note.';
  } else if (study.status === 'InReview' && study.ownerId !== reviewerId) {
    icon = Lock;
    text = `In review by ${who(study.ownerId, reviewerId)}. Only the owner can complete it.`;
  }
  if (text === null) return null;
  const Icon = icon;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {text}
    </p>
  );
}
