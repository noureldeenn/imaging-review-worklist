import type { Prisma, PrismaClient, Study } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { toStudyDto } from './studies.mapper';

export interface CasInput {
  id: string;
  expectedVersion: number;
  where: Prisma.StudyWhereInput;
  data: Prisma.StudyUncheckedUpdateManyInput;
}

/**
 * Single-statement compare-and-swap: the UPDATE only matches when id, version
 * and the state predicate all hold, so concurrent writers cannot both win.
 */
export function runCas(prisma: PrismaClient, input: CasInput): Promise<Study | null> {
  const { id, expectedVersion, where, data } = input;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.study.updateMany({
      where: { id, version: expectedVersion, ...where },
      data,
    });
    return count === 1 ? tx.study.findUniqueOrThrow({ where: { id } }) : null;
  });
}

/** Classify a failed CAS in spec order: 404, 412, 409, 403. */
export function classifyFailure(
  current: Study | null,
  expectedVersion: number,
  kind: 'claim' | 'complete',
  reviewerId: string,
): never {
  if (!current) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Study not found');
  const dto = toStudyDto(current);
  if (current.version !== expectedVersion) {
    throw new ApiError(412, 'STALE_VERSION', 'Study was modified by someone else', dto);
  }
  const requiredStatus = kind === 'claim' ? 'Unassigned' : 'InReview';
  if (current.status !== requiredStatus) {
    throw new ApiError(
      409,
      'INVALID_STATE',
      `Cannot ${kind} a study that is ${current.status}`,
      dto,
    );
  }
  if (kind === 'complete' && current.ownerId !== reviewerId) {
    throw new ApiError(403, 'NOT_OWNER', 'Only the owning reviewer can complete this study', dto);
  }
  // Predicate failed yet nothing differs: the row changed between CAS and re-read.
  throw new ApiError(412, 'STALE_VERSION', 'Study was modified by someone else', dto);
}
