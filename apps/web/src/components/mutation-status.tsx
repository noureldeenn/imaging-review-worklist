import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { ApiRequestError, NetworkError } from '../api/client';
import { studiesKeys } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';
import { Button } from './ui/button';

export type MutationOutcome =
  { kind: 'idle' } | { kind: 'success'; message: string } | { kind: 'error'; error: unknown };

const line = 'flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm';
const errorLine = `${line} border-destructive/30 bg-destructive/10 text-destructive`;

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
      <div
        role="status"
        className="flex animate-panel-in flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2.5 text-sm text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            This study changed (now version {version}). Review the current state, then press Refresh
            and continue.
          </p>
        </div>
        <Button
          type="button"
          variant="warning"
          size="sm"
          className="self-start sm:self-auto"
          onClick={() => {
            unblock(studyId);
            onRefreshed();
            void queryClient.invalidateQueries({ queryKey: studiesKeys.detail(studyId) });
          }}
        >
          <RefreshCw aria-hidden="true" />
          Refresh and continue
        </Button>
      </div>
    );
  }
  if (outcome.kind === 'idle') return <p role="status" />;
  if (outcome.kind === 'success') {
    // Keyed by message so a claim followed by a completion replays the pulse.
    return (
      <p
        key={outcome.message}
        role="status"
        className={`${line} animate-pulse-teal border-primary/30 bg-primary/10 text-primary`}
      >
        <CircleCheck aria-hidden="true" className="size-4" />
        {outcome.message}
      </p>
    );
  }
  if (outcome.error instanceof NetworkError) {
    return (
      <p role="status" className={errorLine}>
        <WifiOff aria-hidden="true" className="size-4" />
        Could not reach the server. Your note is kept.
      </p>
    );
  }
  const { error } = outcome;
  const message =
    error instanceof ApiRequestError || error instanceof Error
      ? error.message
      : 'Something went wrong.';
  return (
    <p role="status" className={errorLine}>
      <CircleAlert aria-hidden="true" className="size-4" />
      {message}
    </p>
  );
}
