import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config';
import { validateDicomUpload } from './dicom-upload';
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
import { resolveStudyFile } from './study-files';

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
    if (!row) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Study not found');
    return toStudyDto(row);
  }

  async getFile(id: string): Promise<{ path: string; size: number }> {
    const row = await this.prisma.study.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Study not found');
    const path = resolveStudyFile(row.fileKey);
    try {
      return { path, size: (await stat(path)).size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ApiError(404, 'STUDY_NOT_FOUND', 'Study not found');
      }
      throw err;
    }
  }

  /** Stores a validated DICOM file and registers it as a new Unassigned study. */
  async upload(bytes: Buffer): Promise<StudyDto> {
    const { modality } = validateDicomUpload(bytes);
    const uuid = randomUUID();
    const dir = path.resolve(loadConfig().localDicomDir);
    const file = path.join(dir, `${uuid}.dcm`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes);
    try {
      const row = await this.prisma.study.create({
        data: {
          id: `upload-${uuid.slice(0, 8)}`,
          modality,
          createdAt: new Date(),
          fileKey: `local:${uuid}`,
        },
      });
      return toStudyDto(row);
    } catch (err) {
      await rm(file, { force: true });
      throw err;
    }
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
