import { Filters } from './components/filters';
import { ReviewerSelect } from './components/reviewer-select';
import { StudyPanel } from './components/study-panel';
import { Worklist } from './components/worklist';
import { useSessionStore } from './stores/session-store';

export function App() {
  const selectedStudyId = useSessionStore((s) => s.selectedStudyId);
  return (
    <div className="app">
      <header className="app-header">
        <h1>Imaging Review Worklist</h1>
        <ReviewerSelect />
      </header>
      <main className="app-main">
        <section className="left" aria-label="Worklist">
          <Filters />
          <Worklist />
        </section>
        <section className="right" aria-label="Study viewer">
          {selectedStudyId === null ? (
            <p>Select a study to view it.</p>
          ) : (
            <StudyPanel key={selectedStudyId} studyId={selectedStudyId} />
          )}
        </section>
      </main>
    </div>
  );
}
