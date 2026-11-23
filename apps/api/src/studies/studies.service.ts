import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ClaimBodyInput,
  CompleteBodyInput,
  ListStudiesQueryInput,
  StudyDto,
} from './studies.dto';
import { toStudyDto } from './studies.mapper';
import { classifyFailure, runCas } from './study-mutations';

const LIST_LIMIT = 100;

@Injectable()
export class StudiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListStudiesQueryInput): Promise<StudyDto[]> {
    const where: Prisma.StudyWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.modality) where.modality = q.modality;
    const rows = await this.prisma.study.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toStudyDto);
  }

  async getOne(id: string): Promise<StudyDto> {
    const row = await this.prisma.study.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, 'STUDY_NOT_FOUND', `Study ${id} not found`);
    return toStudyDto(row);
  }

  private async assertReviewer(reviewerId: string): Promise<void> {
    const reviewer = await this.prisma.reviewer.findUnique({ where: { id: reviewerId } });
    if (!reviewer) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown reviewer');
  }

  async claim(id: string, body: ClaimBodyInput): Promise<StudyDto> {
    const { reviewerId, expectedVersion } = body;
    await this.assertReviewer(reviewerId);
    const updated = await runCas(this.prisma, {
      id,
      expectedVersion,
      where: { status: 'Unassigned' },
      data: { status: 'InReview', ownerId: reviewerId, version: { increment: 1 } },
    });
    if (updated) return toStudyDto(updated);
    const current = await this.prisma.study.findUnique({ where: { id } });
    return classifyFailure(current, expectedVersion, 'claim', reviewerId);
  }

  async complete(id: string, body: CompleteBodyInput): Promise<StudyDto> {
    const { reviewerId, expectedVersion, reviewNote } = body;
    await this.assertReviewer(reviewerId);
    const updated = await runCas(this.prisma, {
      id,
      expectedVersion,
      where: { status: 'InReview', ownerId: reviewerId },
      data: { status: 'Completed', reviewNote, version: { increment: 1 } },
    });
    if (updated) return toStudyDto(updated);
    const current = await this.prisma.study.findUnique({ where: { id } });
    return classifyFailure(current, expectedVersion, 'complete', reviewerId);
  }
}
