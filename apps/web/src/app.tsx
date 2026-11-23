import { ArrowLeft, MousePointerClick } from 'lucide-react';
import { AppShell } from './components/app-shell';
import { Filters } from './components/filters';
import { ReviewerSelect } from './components/reviewer-select';
import { StudyPanel } from './components/study-panel';
import { Worklist } from './components/worklist';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { useSessionStore } from './stores/session-store';

export function App() {
  const selectedStudyId = useSessionStore((s) => s.selectedStudyId);
  const selectStudy = useSessionStore((s) => s.selectStudy);
  return (
    <AppShell
      selectedKey={selectedStudyId}
      headerActions={<ReviewerSelect />}
      worklist={
        <>
          <div className="border-b p-3">
            <Filters />
          </div>
          <ScrollArea className="min-h-0 flex-1 p-2">
            <Worklist />
          </ScrollArea>
        </>
      }
      detail={
        selectedStudyId === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-full border bg-secondary text-muted-foreground"
            >
              <MousePointerClick className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">Select a study to view it.</p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            {/* Narrow screens only: the detail replaces the list, so offer a way back. */}
            <div className="border-b p-2 min-[900px]:hidden">
              <Button type="button" variant="ghost" onClick={() => selectStudy(null)}>
                <ArrowLeft aria-hidden="true" />
                Back to worklist
              </Button>
            </div>
            <StudyPanel key={selectedStudyId} studyId={selectedStudyId} />
          </ScrollArea>
        )
      }
    />
  );
}
