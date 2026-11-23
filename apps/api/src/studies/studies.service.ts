import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type { ListStudiesQueryInput, StudyDto } from './studies.dto';
import { toStudyDto } from './studies.mapper';

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
}
