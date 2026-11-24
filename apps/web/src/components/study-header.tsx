import { useEffect, useRef, type ReactNode } from 'react';
import type { StudyDto } from '../api/schemas';
import { ModalityChip } from './modality-chip';
import { OwnerAvatar } from './owner-avatar';
import { StatusBadge } from './status-badge';

/**
 * Detail header. The <h3> keeps its full text ("id · modality · status · version n")
 * for assistive tech and tests; sighted users get the same facts as badges, which
 * are aria-hidden so nothing is announced twice.
 */
export function StudyHeader({
  study,
  owner,
  autoFocus = false,
  children,
}: {
  study: StudyDto;
  owner: string;
  /** True while the header sits in a floating (overlay / sheet) review panel that is open. */
  autoFocus?: boolean;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousId = useRef<string | null>(null);
  const studyId = study.id;
  // In a floating review panel (overlay or bottom sheet) keyboard and screen-reader
  // users land on the study heading when the panel opens or the study changes.
  // Not when they already tabbed into the panel (for example to Claim while the
  // study was loading), and never in the push layout, where the panel is static.
  useEffect(() => {
    const switched = previousId.current !== null && previousId.current !== studyId;
    previousId.current = studyId;
    const heading = headingRef.current;
    if (!heading || !autoFocus) return;
    const pane = heading.closest('section');
    const focusInPane = pane !== null && pane.contains(document.activeElement);
    if (switched || !focusInPane) heading.focus({ preventScroll: true });
  }, [studyId, autoFocus]);

  return (
    <header className="flex animate-panel-in flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-mono text-lg leading-tight font-semibold tracking-tight outline-none"
        >
          {study.id}
          <span className="sr-only">
            {' '}
            · {study.modality} · {study.status} · version {study.version}
          </span>
        </h3>
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
