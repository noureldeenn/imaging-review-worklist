import { z } from 'zod';

export const StudyStatus = z.enum(['Unassigned', 'InReview', 'Completed']);
export type StudyStatus = z.infer<typeof StudyStatus>;

export const StudyDto = z.object({
  id: z.string(),
  modality: z.string(),
  createdAt: z.string(),
  status: StudyStatus,
  ownerId: z.string().nullable(),
  reviewNote: z.string().nullable(),
  version: z.number().int(),
});
export type StudyDto = z.infer<typeof StudyDto>;

export const StudyListDto = z.array(StudyDto);

export const ReviewerDto = z.object({ id: z.string(), name: z.string() });
export type ReviewerDto = z.infer<typeof ReviewerDto>;

export const ReviewerListDto = z.array(ReviewerDto);

export const ApiErrorCode = z.enum([
  'VALIDATION_ERROR',
  'STUDY_NOT_FOUND',
  'STALE_VERSION',
  'INVALID_STATE',
  'NOT_OWNER',
  'NOT_FOUND',
  'REQUEST_REJECTED',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorBody = z.object({
  code: ApiErrorCode,
  message: z.string(),
  current: StudyDto.optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
