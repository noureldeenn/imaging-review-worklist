import { useState } from "react";
import { useClaimStudy, useCompleteStudy } from "../queries/study-mutations";
import { useStudy } from "../queries/studies-queries";
import { useSessionStore } from "../stores/session-store";
import { CompletionForm } from "./completion-form";
import { MutationStatus, type MutationOutcome } from "./mutation-status";

export function StudyPanel({ studyId }: { studyId: string }) {
  const reviewerId = useSessionStore((s) => s.reviewerId);
  const isBlocked = useSessionStore((s) => s.blocked[studyId] === true);
  const selectStudy = useSessionStore((s) => s.selectStudy);
  const { data: study, isPending, isError } = useStudy(studyId);
  const claim = useClaimStudy();
  const complete = useCompleteStudy();
  const [last, setLast] = useState<"claim" | "complete" | null>(null);

  const pending = claim.isPending || complete.isPending;
  const active =
    last === "claim" ? claim : last === "complete" ? complete : null;
  let outcome: MutationOutcome = { kind: "idle" };
  if (active?.isError) outcome = { kind: "error", error: active.error };
  else if (active?.isSuccess)
    outcome = {
      kind: "success",
      message: last === "claim" ? "Study claimed." : "Study completed.",
    };

  if (isPending) return <p role="status">Loading study…</p>;
  if (isError || !study)
    return <p role="alert">Could not load study {studyId}.</p>;

  const owner =
    study.ownerId === null
      ? "none"
      : study.ownerId === reviewerId
        ? "you"
        : study.ownerId;
  const canClaim = study.status === "Unassigned" && !isBlocked && !pending;
  const canComplete =
    study.status === "InReview" && study.ownerId === reviewerId;

  return (
    <article aria-label={`Study ${study.id}`}>
      <h2>
        {study.id} · {study.modality} · {study.status} · version {study.version}
      </h2>
      <p>Owner: {owner}</p>
      <div className="actions">
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => {
            setLast("claim");
            claim.mutate({
              id: study.id,
              reviewerId,
              expectedVersion: study.version,
            });
          }}
        >
          Claim
        </button>
        <button type="button" onClick={() => selectStudy(null)}>
          Close viewer
        </button>
      </div>
      <div data-testid="viewer-slot" />
      {canComplete && (
        <CompletionForm
          study={study}
          pending={pending}
          onSubmit={(note) => {
            setLast("complete");
            complete.mutate({
              id: study.id,
              reviewerId,
              expectedVersion: study.version,
              reviewNote: note,
            });
          }}
        />
      )}
      <MutationStatus
        studyId={study.id}
        version={study.version}
        outcome={outcome}
        onRefreshed={() => {
          claim.reset();
          complete.reset();
          setLast(null);
        }}
      />
    </article>
  );
}
