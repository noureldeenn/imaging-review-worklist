import { lazy, Suspense } from 'react';
import { ViewerErrorBoundary } from './viewer-error-boundary';

const StudyViewer = lazy(() => import('./study-viewer').then((m) => ({ default: m.StudyViewer })));

export function StudyViewerLazy({ studyId }: { studyId: string }) {
  return (
    <ViewerErrorBoundary resetKey={studyId}>
      <Suspense fallback={<p role="status">Loading viewer…</p>}>
        <StudyViewer studyId={studyId} />
      </Suspense>
    </ViewerErrorBoundary>
  );
}
