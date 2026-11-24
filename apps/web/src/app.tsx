import { MousePointerClick } from 'lucide-react';
import { AppShell } from './components/app-shell';
import { ReviewerSelect } from './components/reviewer-select';
import { StudyPanel } from './components/study-panel';
import { MeasurementsSection } from './layout/measurements-section';
import { ReviewPanel } from './layout/review-panel';
import { useLayoutState } from './layout/use-layout-state';
import { WorklistDrawer } from './layout/worklist-drawer';
import { useSessionStore } from './stores/session-store';
import { AppToolbar } from './toolbar/app-toolbar';
import { StudyViewerLazy } from './viewer/study-viewer-lazy';

function EmptyViewer() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-full border border-white/10 bg-secondary text-muted-foreground"
      >
        <MousePointerClick className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">Select a study to view it.</p>
    </div>
  );
}

export function App() {
  const selectedStudyId = useSessionStore((s) => s.selectedStudyId);
  const blocked = useSessionStore((s) =>
    selectedStudyId === null ? false : s.blocked[selectedStudyId] === true,
  );
  const layout = useLayoutState(selectedStudyId);
  const floating = layout.mode !== 'push';

  return (
    <AppShell
      headerActions={<ReviewerSelect />}
      toolbar={
        <AppToolbar
          layout={{ ...layout, reviewAttention: blocked || layout.feedbackUnseen }}
          studyId={selectedStudyId}
        />
      }
      viewer={
        selectedStudyId === null ? <EmptyViewer /> : <StudyViewerLazy studyId={selectedStudyId} />
      }
      panel={
        selectedStudyId !== null && (
          <ReviewPanel
            mode={layout.mode}
            open={layout.reviewOpen}
            focusOnOpen={layout.reviewFocusOnOpen}
            onClose={layout.closeReview}
          >
            <StudyPanel
              key={selectedStudyId}
              studyId={selectedStudyId}
              autoFocus={floating && layout.reviewOpen && layout.reviewFocusOnOpen}
              onFeedback={layout.revealReview}
            />
            <MeasurementsSection studyId={selectedStudyId} />
          </ReviewPanel>
        )
      }
      drawer={<WorklistDrawer open={layout.worklistOpen} onClose={layout.closeWorklist} />}
    />
  );
}
