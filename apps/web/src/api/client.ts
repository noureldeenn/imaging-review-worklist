import type { z } from 'zod';
import {
  ApiErrorBody,
  ReviewerListDto,
  StudyDto,
  StudyListDto,
  type ApiErrorCode,
  type ReviewerDto,
  type StudyStatus,
} from './schemas';

export type StudyFilters = { status?: StudyStatus; modality?: string };

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'UNKNOWN',
    message: string,
    readonly current?: StudyDto,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new NetworkError();
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(body);
    if (parsed.success) {
      const { code, message, current } = parsed.data;
      throw new ApiRequestError(res.status, code, message, current);
    }
    throw new ApiRequestError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
  }
  return schema.parse(body);
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function studiesPath(filters: StudyFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.modality) params.set('modality', filters.modality);
  const qs = params.toString();
  return qs ? `/api/studies?${qs}` : '/api/studies';
}

export const api = {
  listReviewers: (): Promise<ReviewerDto[]> => request('/api/reviewers', ReviewerListDto),
  listStudies: (filters: StudyFilters): Promise<StudyDto[]> =>
    request(studiesPath(filters), StudyListDto),
  getStudy: (id: string): Promise<StudyDto> =>
    request(`/api/studies/${encodeURIComponent(id)}`, StudyDto),
  uploadStudy: (file: File): Promise<StudyDto> =>
    request('/api/studies/upload', StudyDto, {
      method: 'POST',
      headers: { 'Content-Type': 'application/dicom' },
      body: file,
    }),
  claim: (id: string, body: { reviewerId: string; expectedVersion: number }): Promise<StudyDto> =>
    request(`/api/studies/${encodeURIComponent(id)}/claim`, StudyDto, postJson(body)),
  complete: (
    id: string,
    body: { reviewerId: string; expectedVersion: number; reviewNote: string },
  ): Promise<StudyDto> =>
    request(`/api/studies/${encodeURIComponent(id)}/complete`, StudyDto, postJson(body)),
};
