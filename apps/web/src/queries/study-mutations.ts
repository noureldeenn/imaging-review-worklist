import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from '../api/client';
import type { StudyDto } from '../api/schemas';
import { useSessionStore } from '../stores/session-store';
import { studiesKeys } from './studies-queries';

async function applyServerState(queryClient: QueryClient, dto: StudyDto) {
  // Discard any in-flight (possibly stale) detail GET before writing the authoritative state.
  await queryClient.cancelQueries({ queryKey: studiesKeys.detail(dto.id) });
  queryClient.setQueryData(studiesKeys.detail(dto.id), dto);
}

async function handleMutationError(queryClient: QueryClient, id: string, err: unknown) {
  if (err instanceof ApiRequestError && err.status === 412 && err.current) {
    await applyServerState(queryClient, err.current);
    useSessionStore.getState().block(id);
    // Only the list prefix: the detail entry was just written authoritatively.
    await queryClient.invalidateQueries({ queryKey: studiesKeys.lists });
    return;
  }
  // Other failures: keep the draft, refetch so the panel and the list reflect the server.
  if (err instanceof ApiRequestError) {
    await queryClient.invalidateQueries({ queryKey: studiesKeys.detail(id) });
    await queryClient.invalidateQueries({ queryKey: studiesKeys.lists });
  }
}

export function useClaimStudy(studyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['study', studyId, 'claim'],
    mutationFn: (v: { id: string; reviewerId: string; expectedVersion: number }) =>
      api.claim(v.id, {
        reviewerId: v.reviewerId,
        expectedVersion: v.expectedVersion,
      }),
    onSuccess: async (dto) => {
      await applyServerState(queryClient, dto);
      await queryClient.invalidateQueries({ queryKey: studiesKeys.lists });
    },
    onError: (err, v) => handleMutationError(queryClient, v.id, err),
  });
}

export function useCompleteStudy(studyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['study', studyId, 'complete'],
    mutationFn: (v: {
      id: string;
      reviewerId: string;
      expectedVersion: number;
      reviewNote: string;
    }) =>
      api.complete(v.id, {
        reviewerId: v.reviewerId,
        expectedVersion: v.expectedVersion,
        reviewNote: v.reviewNote,
      }),
    onSuccess: async (dto) => {
      await applyServerState(queryClient, dto);
      useSessionStore.getState().setDraft(dto.id, '');
      await queryClient.invalidateQueries({ queryKey: studiesKeys.lists });
    },
    onError: (err, v) => handleMutationError(queryClient, v.id, err),
  });
}
