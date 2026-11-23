import { lazy, Suspense } from 'react';
import { ViewerErrorBoundary } from './viewer-error-boundary';

// React.lazy caches a rejected import for the lifetime of the lazy object, so a
// single chunk-load failure would make every later mount fail too. On failure
// we swap in a fresh lazy component; the next mount (close and reopen) retries.
function createLazyViewer() {
  return lazy(() =>
    import('./study-viewer')
      .then((m) => ({ default: m.StudyViewer }))
      .catch((error: unknown) => {
        LazyViewer = createLazyViewer();
        throw error;
      }),
  );
}

let LazyViewer = createLazyViewer();

export function StudyViewerLazy({ studyId }: { studyId: string }) {
  return (
    <ViewerErrorBoundary resetKey={studyId}>
      <Suspense fallback={<p role="status">Loading viewer…</p>}>
        <LazyViewer studyId={studyId} />
      </Suspense>
    </ViewerErrorBoundary>
  );
}
