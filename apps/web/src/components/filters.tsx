import { StudyStatus } from '../api/schemas';
import type { StudyFilters } from '../api/client';
import { useSessionStore } from '../stores/session-store';

const MODALITIES = ['CT', 'MR', 'CR', 'US', 'OT'];

export function Filters() {
  const filters = useSessionStore((s) => s.filters);
  const setFilters = useSessionStore((s) => s.setFilters);

  function update(key: 'status' | 'modality', value: string) {
    const next: StudyFilters = { ...filters };
    if (key === 'status') {
      const parsed = StudyStatus.safeParse(value);
      if (parsed.success) next.status = parsed.data;
      else delete next.status;
    } else if (value === '') {
      delete next.modality;
    } else {
      next.modality = value;
    }
    setFilters(next);
  }

  return (
    <div className="filters">
      <label className="field">
        Status
        <select value={filters.status ?? ''} onChange={(e) => update('status', e.target.value)}>
          <option value="">All</option>
          {StudyStatus.options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Modality
        <select value={filters.modality ?? ''} onChange={(e) => update('modality', e.target.value)}>
          <option value="">All</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
