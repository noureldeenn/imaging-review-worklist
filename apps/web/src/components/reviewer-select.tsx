import { useReviewers } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';

export function ReviewerSelect() {
  const reviewerId = useSessionStore((s) => s.reviewerId);
  const setReviewer = useSessionStore((s) => s.setReviewer);
  const { data } = useReviewers();
  const options = data ?? [{ id: reviewerId, name: reviewerId }];
  return (
    <label className="field">
      Reviewer
      <select value={reviewerId} onChange={(e) => setReviewer(e.target.value)}>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
