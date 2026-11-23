import { useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, NetworkError } from "../api/client";
import { studiesKeys } from "../queries/studies-queries";
import { useSessionStore } from "../stores/session-store";

export type MutationOutcome =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; error: unknown };

export function MutationStatus({
  studyId,
  outcome,
  onRefreshed,
}: {
  studyId: string;
  outcome: MutationOutcome;
  onRefreshed: () => void;
}) {
  const queryClient = useQueryClient();
  const unblock = useSessionStore((s) => s.unblock);
  if (outcome.kind === "idle") return <p role="status" />;
  if (outcome.kind === "success") return <p role="status">{outcome.message}</p>;

  const { error } = outcome;
  if (error instanceof ApiRequestError && error.status === 412) {
    const version = error.current?.version;
    return (
      <div role="status">
        <p>
          This study changed (now version {version ?? "unknown"}). Review the
          current state, then press Refresh and continue.
        </p>
        <button
          type="button"
          onClick={() => {
            unblock(studyId);
            onRefreshed();
            void queryClient.invalidateQueries({
              queryKey: studiesKeys.detail(studyId),
            });
          }}
        >
          Refresh and continue
        </button>
      </div>
    );
  }
  if (error instanceof NetworkError) {
    return <p role="status">Could not reach the server. Your note is kept.</p>;
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return <p role="status">{message}</p>;
}
