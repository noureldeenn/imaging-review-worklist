import type { Study } from '@prisma/client';
import type { StudyDto } from './studies.dto';

export function toStudyDto(study: Study): StudyDto {
  return {
    id: study.id,
    modality: study.modality,
    createdAt: study.createdAt.toISOString(),
    status: study.status,
    ownerId: study.ownerId ?? null,
    reviewNote: study.reviewNote ?? null,
    version: study.version,
  };
}
