import { useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, NetworkError } from '../api/client';
import { studiesKeys } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';

export type MutationOutcome =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; error: unknown };

export function MutationStatus({
  studyId,
  version,
  outcome,
  onRefreshed,
}: {
  studyId: string;
  version: number;
  outcome: MutationOutcome;
  onRefreshed: () => void;
}) {
  const queryClient = useQueryClient();
  const isBlocked = useSessionStore((s) => s.blocked[studyId] === true);
  const unblock = useSessionStore((s) => s.unblock);

  // The stale-version notice is derived from store state so it survives remounts.
  if (isBlocked) {
    return (
      <div role="status">
        <p>
          This study changed (now version {version}). Review the current state, then press Refresh
          and continue.
        </p>
        <button
          type="button"
          onClick={() => {
            unblock(studyId);
            onRefreshed();
            void queryClient.invalidateQueries({ queryKey: studiesKeys.detail(studyId) });
          }}
        >
          Refresh and continue
        </button>
      </div>
    );
  }
  if (outcome.kind === 'idle') return <p role="status" />;
  if (outcome.kind === 'success') return <p role="status">{outcome.message}</p>;
  if (outcome.error instanceof NetworkError) {
    return <p role="status">Could not reach the server. Your note is kept.</p>;
  }
  const { error } = outcome;
  const message =
    error instanceof ApiRequestError || error instanceof Error
      ? error.message
      : 'Something went wrong.';
  return <p role="status">{message}</p>;
}
