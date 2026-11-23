import { useQuery } from '@tanstack/react-query';
import { api, type StudyFilters } from '../api/client';

export const studiesKeys = {
  all: ['studies'] as const,
  list: (filters: StudyFilters) => ['studies', 'list', filters] as const,
  detail: (id: string) => ['studies', 'detail', id] as const,
};

export const reviewersKey = ['reviewers'] as const;

export function useStudies(filters: StudyFilters) {
  return useQuery({
    queryKey: studiesKeys.list(filters),
    queryFn: () => api.listStudies(filters),
  });
}

export function useStudy(id: string | null) {
  return useQuery({
    queryKey: studiesKeys.detail(id ?? ''),
    queryFn: () => api.getStudy(id ?? ''),
    enabled: id !== null,
  });
}

export function useReviewers() {
  return useQuery({ queryKey: reviewersKey, queryFn: () => api.listReviewers() });
}
