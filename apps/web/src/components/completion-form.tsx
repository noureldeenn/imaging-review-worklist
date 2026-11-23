import type { StudyDto } from "../api/schemas";
import { useSessionStore } from "../stores/session-store";

export const MAX_NOTE_LENGTH = 1000;

export function CompletionForm({
  study,
  pending,
  onSubmit,
}: {
  study: StudyDto;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  const draft = useSessionStore((s) => s.drafts[study.id] ?? "");
  const isBlocked = useSessionStore((s) => s.blocked[study.id] === true);
  const setDraft = useSessionStore((s) => s.setDraft);
  const valid = draft.trim().length >= 1 && draft.length <= MAX_NOTE_LENGTH;
  const canComplete = valid && !isBlocked && !pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canComplete) onSubmit(draft.trim());
      }}
    >
      <label className="field">
        Review note
        <textarea
          value={draft}
          rows={5}
          onChange={(e) => setDraft(study.id, e.target.value)}
          aria-describedby="note-count"
        />
      </label>
      <small id="note-count">
        {draft.length}/{MAX_NOTE_LENGTH}
      </small>
      <button type="submit" disabled={!canComplete}>
        Complete
      </button>
    </form>
  );
}
