import { ChevronDown } from 'lucide-react';
import { useReviewers } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';
import { OwnerAvatar } from './owner-avatar';
import { Label } from './ui/label';
import { NativeSelect } from './ui/native-select';

export function ReviewerSelect() {
  const reviewerId = useSessionStore((s) => s.reviewerId);
  const setReviewer = useSessionStore((s) => s.setReviewer);
  const { data } = useReviewers();
  const options = data ?? [{ id: reviewerId, name: reviewerId }];
  return (
    <div className="flex items-center gap-2">
      <OwnerAvatar ownerId={reviewerId} className="hidden size-7 text-xs sm:grid" />
      {/* The select stays a direct child of the label so the label text is exactly "Reviewer". */}
      <Label className="relative flex items-center gap-2">
        <span className="sr-only sm:not-sr-only">Reviewer</span>
        <NativeSelect
          className="h-8 w-32 bg-secondary sm:w-36"
          value={reviewerId}
          onChange={(e) => setReviewer(e.target.value)}
        >
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </NativeSelect>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground"
        />
      </Label>
    </div>
  );
}
