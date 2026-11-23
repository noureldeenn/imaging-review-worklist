import { useStudies } from '../queries/studies-queries';
import { useSessionStore } from '../stores/session-store';

export function Worklist() {
  const filters = useSessionStore((s) => s.filters);
  const selectedStudyId = useSessionStore((s) => s.selectedStudyId);
  const selectStudy = useSessionStore((s) => s.selectStudy);
  const { data, isPending, isError, refetch } = useStudies(filters);

  if (isPending) return <p role="status">Loading studies…</p>;
  if (isError) {
    return (
      <div role="alert">
        <p>Could not load studies.</p>
        <button type="button" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (data.length === 0) return <p>No studies match these filters.</p>;

  return (
    <ul className="worklist">
      {data.map((study) => (
        <li key={study.id}>
          <button
            type="button"
            aria-pressed={selectedStudyId === study.id}
            aria-label={`Open study ${study.id}`}
            onClick={() => selectStudy(study.id)}
          >
            {study.id} · {study.modality} · {study.status}
            {study.ownerId ? ` · ${study.ownerId}` : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}
