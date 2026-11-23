import { Hand, X } from 'lucide-react';
import { useState } from 'react';
import { useClaimStudy, useCompleteStudy } from '../queries/study-mutations';
import { useStudy } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';
import { StudyViewerLazy } from '../viewer/study-viewer-lazy';
import { CompletionForm } from './completion-form';
import { MutationStatus, type MutationOutcome } from './mutation-status';
import { StudyHeader } from './study-header';
import { PendingIcon } from './pending-icon';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export function StudyPanel({ studyId }: { studyId: string }) {
  const reviewerId = useSessionStore((s) => s.reviewerId);
  const isBlocked = useSessionStore((s) => s.blocked[studyId] === true);
  const selectStudy = useSessionStore((s) => s.selectStudy);
  const { data: study, isPending, isError } = useStudy(studyId);
  const claim = useClaimStudy();
  const complete = useCompleteStudy();
  const [last, setLast] = useState<'claim' | 'complete' | null>(null);

  const pending = claim.isPending || complete.isPending;
  const active = last === 'claim' ? claim : last === 'complete' ? complete : null;
  let outcome: MutationOutcome = { kind: 'idle' };
  if (active?.isError) outcome = { kind: 'error', error: active.error };
  else if (active?.isSuccess)
    outcome = {
      kind: 'success',
      message: last === 'claim' ? 'Study claimed.' : 'Study completed.',
    };

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p role="status" className="text-xs text-muted-foreground">
          Loading study…
        </p>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="aspect-[4/3] max-h-[480px] w-full" />
      </div>
    );
  }
  if (isError || !study) {
    return (
      <p role="alert" className="m-4 text-sm text-destructive">
        Could not load study {studyId}.
      </p>
    );
  }

  const owner =
    study.ownerId === null ? 'none' : study.ownerId === reviewerId ? 'you' : study.ownerId;
  const canClaim = study.status === 'Unassigned' && !isBlocked && !pending;
  const canComplete = study.status === 'InReview' && study.ownerId === reviewerId;

  return (
    <article aria-label={`Study ${study.id}`} className="flex flex-col gap-3 p-3 sm:p-4">
      <StudyHeader study={study} owner={owner}>
        <Button
          type="button"
          disabled={!canClaim}
          onClick={() => {
            setLast('claim');
            claim.mutate({
              id: study.id,
              reviewerId,
              expectedVersion: study.version,
            });
          }}
        >
          <PendingIcon pending={claim.isPending} icon={Hand} />
          Claim
        </Button>
        <Button type="button" variant="ghost" onClick={() => selectStudy(null)}>
          <X aria-hidden="true" />
          Close viewer
        </Button>
      </StudyHeader>
      <StudyViewerLazy studyId={studyId} />
      {canComplete && (
        <CompletionForm
          study={study}
          pending={pending}
          onSubmit={(note) => {
            setLast('complete');
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
