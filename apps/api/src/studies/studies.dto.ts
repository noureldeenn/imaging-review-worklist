import { z } from 'zod';

export const StudyStatusSchema = z.enum(['Unassigned', 'InReview', 'Completed']);
export type StudyStatusValue = z.infer<typeof StudyStatusSchema>;

export const StudyDtoSchema = z.object({
  id: z.string(),
  modality: z.string(),
  createdAt: z.string(),
  status: StudyStatusSchema,
  ownerId: z.string().nullable(),
  reviewNote: z.string().nullable(),
  version: z.number().int(),
});
export type StudyDto = z.infer<typeof StudyDtoSchema>;

export const ListStudiesQuery = z.object({
  status: StudyStatusSchema.optional(),
  modality: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim().toUpperCase();
    return t === '' ? undefined : t;
  }, z.string().min(1).optional()),
});
export type ListStudiesQueryInput = z.infer<typeof ListStudiesQuery>;
