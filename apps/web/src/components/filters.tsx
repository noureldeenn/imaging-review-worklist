import { ChevronDown } from 'lucide-react';
import { StudyStatus } from '../api/schemas';
import type { StudyFilters } from '../api/client';
import { useSessionStore } from '../stores/session-store';
import { Label } from './ui/label';
import { NativeSelect } from './ui/native-select';

const MODALITIES = ['CT', 'MR', 'CR', 'US', 'OT'];

const chevron = (
  <ChevronDown
    aria-hidden="true"
    className="pointer-events-none absolute right-2.5 bottom-2.5 size-4 max-[899px]:bottom-3.5 text-muted-foreground"
  />
);

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

  // Each <select> is a direct child of its <label> so the label text stays exactly "Status"/"Modality".
  return (
    <div className="grid grid-cols-2 gap-2">
      <Label className="relative flex flex-col items-stretch gap-1.5">
        Status
        <NativeSelect
          value={filters.status ?? ''}
          onChange={(e) => update('status', e.target.value)}
        >
          <option value="">All</option>
          {StudyStatus.options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        {chevron}
      </Label>
      <Label className="relative flex flex-col items-stretch gap-1.5">
        Modality
        <NativeSelect
          value={filters.modality ?? ''}
          onChange={(e) => update('modality', e.target.value)}
        >
          <option value="">All</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </NativeSelect>
        {chevron}
      </Label>
    </div>
  );
}
