import { useEffect } from 'react';
import { useAnnotationStore } from './annotation-store';

/** How long the notice stays visible (it is announced once either way). */
export const NOTICE_MS = 5000;

/**
 * A short status line in the viewer's info strip, where the user is drawing:
 * e.g. a refused shape over the per-study limit. The region is always mounted
 * (only its text changes, so it is announced) and nothing animates.
 */
export function MeasurementNotice({ studyId }: { studyId: string }) {
  const notice = useAnnotationStore((s) => (s.notice?.studyId === studyId ? s.notice : null));
  const at = notice?.at;
  useEffect(() => {
    if (at === undefined) return undefined;
    const timer = setTimeout(() => useAnnotationStore.getState().clearNotice(at), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [at]);
  return (
    <p
      role="status"
      data-testid="measurement-notice"
      className="text-xs font-medium text-warning empty:hidden"
    >
      {notice?.text ?? ''}
    </p>
  );
}
