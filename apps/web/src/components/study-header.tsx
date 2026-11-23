import type { ReactNode } from 'react';
import type { StudyDto } from '../api/schemas';
import { ModalityChip } from './modality-chip';
import { OwnerAvatar } from './owner-avatar';
import { StatusBadge } from './status-badge';

/**
 * Detail header. The <h2> keeps its full text ("id · modality · status · version n")
 * for assistive tech and tests; sighted users get the same facts as badges, which
 * are aria-hidden so nothing is announced twice.
 */
export function StudyHeader({
  study,
  owner,
  children,
}: {
  study: StudyDto;
  owner: string;
  children: ReactNode;
}) {
  return (
    <header className="flex animate-panel-in flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-mono text-lg leading-tight font-semibold tracking-tight">
          {study.id}
          <span className="sr-only">
            {' '}
            · {study.modality} · {study.status} · version {study.version}
          </span>
        </h2>
        <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
          <StatusBadge status={study.status} />
          <ModalityChip modality={study.modality} />
          <span className="font-mono text-xs text-muted-foreground">v{study.version}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {study.ownerId !== null && <OwnerAvatar ownerId={study.ownerId} />}
          <p>Owner: {owner}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
