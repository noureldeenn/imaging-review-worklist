import { CheckCheck } from 'lucide-react';
import type { StudyDto } from '../api/schemas';
import { useSessionStore } from '../stores/session-store';
import { cn } from '@/lib/utils';
import { PendingIcon } from './pending-icon';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

export const MAX_NOTE_LENGTH = 1000;
/** The counter turns amber from here on, red past the limit. */
const NEAR_LIMIT = 900;

export function CompletionForm({
  study,
  pending,
  onSubmit,
}: {
  study: StudyDto;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  const draft = useSessionStore((s) => s.drafts[study.id] ?? '');
  const isBlocked = useSessionStore((s) => s.blocked[study.id] === true);
  const setDraft = useSessionStore((s) => s.setDraft);
  const valid = draft.trim().length >= 1 && draft.length <= MAX_NOTE_LENGTH;
  const canComplete = valid && !isBlocked && !pending;
  const over = draft.length > MAX_NOTE_LENGTH;

  return (
    <Card className="animate-panel-in">
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canComplete) onSubmit(draft.trim());
          }}
        >
          {/* The textarea stays a direct child of the label: its text is exactly "Review note". */}
          <Label className="flex flex-col items-stretch gap-2 text-sm text-foreground">
            Review note
            <Textarea
              value={draft}
              rows={5}
              onChange={(e) => setDraft(study.id, e.target.value)}
              aria-describedby="note-count"
              aria-invalid={over || undefined}
            />
          </Label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <small
              id="note-count"
              className={cn(
                'font-mono text-xs tabular-nums text-muted-foreground transition-colors',
                draft.length >= NEAR_LIMIT && 'text-warning',
                over && 'text-destructive',
              )}
            >
              {draft.length}/{MAX_NOTE_LENGTH}
            </small>
            <Button type="submit" disabled={!canComplete}>
              <PendingIcon pending={pending} icon={CheckCheck} />
              Complete
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
