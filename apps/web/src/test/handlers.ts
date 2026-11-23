import { http, HttpResponse } from 'msw';
import type { StudyDto } from '../api/schemas';

const modalities = ['CT', 'MR', 'CR', 'US', 'CT', 'MR', 'CR', 'US'];

export function makeStudy(n: number, overrides: Partial<StudyDto> = {}): StudyDto {
  return {
    id: `study-${String(n).padStart(3, '0')}`,
    modality: modalities[(n - 1) % modalities.length] ?? 'CT',
    createdAt: new Date(Date.UTC(2026, 0, n)).toISOString(),
    status: 'Unassigned',
    ownerId: null,
    reviewNote: null,
    version: 0,
    ...overrides,
  };
}

export const seededStudies: StudyDto[] = Array.from({ length: 8 }, (_, i) => makeStudy(i + 1));

export const handlers = [
  http.get('/api/reviewers', () =>
    HttpResponse.json([
      { id: 'reviewer-a', name: 'Reviewer A' },
      { id: 'reviewer-b', name: 'Reviewer B' },
    ]),
  ),
  http.get('/api/studies', () => HttpResponse.json(seededStudies)),
];
