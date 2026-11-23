import { CircleAlert, LoaderCircle, RotateCw, SearchX } from 'lucide-react';
import type { StudyDto } from '../api/schemas';
import { useStudies } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';
import { ModalityChip } from './modality-chip';
import { OwnerAvatar } from './owner-avatar';
import { StatusBadge } from './status-badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

// Rows fade/slide in on mount, 20 ms apart; capped so long lists never wait.
const STAGGER_MS = 20;
const STAGGER_CAP = 12;

export function Worklist() {
  const filters = useSessionStore((s) => s.filters);
  const selectedStudyId = useSessionStore((s) => s.selectedStudyId);
  const selectStudy = useSessionStore((s) => s.selectStudy);
  const { data, isPending, isError, refetch } = useStudies(filters);

  if (isPending) {
    return (
      <div className="flex flex-col gap-1.5">
        <p
          role="status"
          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          Loading studies…
        </p>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[60px]" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="m-1 flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3"
      >
        <p className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="size-4" />
          Could not load studies.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full border bg-secondary text-muted-foreground"
        >
          <SearchX className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">No studies match these filters.</p>
      </div>
    );
  }

  return (
    <>
      <p className="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {data.length} {data.length === 1 ? 'study' : 'studies'}
      </p>
      <ul className="flex flex-col gap-1">
        {data.map((study, i) => (
          <li
            key={study.id}
            className="animate-row-in"
            style={{ animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms` }}
          >
            <WorklistRow
              study={study}
              selected={selectedStudyId === study.id}
              onSelect={() => selectStudy(study.id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function WorklistRow({
  study,
  selected,
  onSelect,
}: {
  study: StudyDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Open study ${study.id}`}
      onClick={onSelect}
      className="group relative flex min-h-14 w-full flex-col justify-center gap-1.5 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors duration-150 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-pressed:border-primary/25 aria-pressed:bg-primary/10"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary opacity-0 transition-opacity duration-150 group-aria-pressed:opacity-100"
      />
      <span className="flex w-full items-center gap-2">
        <span className="font-mono text-[13px] font-medium text-foreground">{study.id}</span>
        <ModalityChip modality={study.modality} />
        <StatusBadge status={study.status} className="ml-auto" />
      </span>
      <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
        <time dateTime={study.createdAt} className="tabular-nums">
          {dateFormat.format(new Date(study.createdAt))}
        </time>
        {study.ownerId ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <OwnerAvatar ownerId={study.ownerId} />
            <span className="truncate font-mono">{study.ownerId}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/80">No owner</span>
        )}
      </span>
    </button>
  );
}
