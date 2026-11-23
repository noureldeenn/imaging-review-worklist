import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { seed } from '../prisma/seed';
import { createTestPrisma, resetTestDb } from './db';

const prisma: PrismaClient = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seed', () => {
  it('seeds 2 reviewers and 8 studies in the spec order', async () => {
    await resetTestDb(prisma);
    expect(await prisma.reviewer.count()).toBe(2);
    const studies = await prisma.study.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    expect(
      studies.map((s) => ({
        id: s.id,
        modality: s.modality,
        fileKey: s.fileKey,
        status: s.status,
        ownerId: s.ownerId,
        reviewNote: s.reviewNote,
      })),
    ).toEqual([
      {
        id: 'study-001',
        modality: 'OT',
        fileKey: 'gradient',
        status: 'Unassigned',
        ownerId: null,
        reviewNote: null,
      },
      {
        id: 'study-002',
        modality: 'OT',
        fileKey: 'checkerboard',
        status: 'Unassigned',
        ownerId: null,
        reviewNote: null,
      },
      {
        id: 'study-003',
        modality: 'OT',
        fileKey: 'corrupt',
        status: 'Unassigned',
        ownerId: null,
        reviewNote: null,
      },
      {
        id: 'study-004',
        modality: 'CT',
        fileKey: 'gradient',
        status: 'InReview',
        ownerId: 'reviewer-a',
        reviewNote: null,
      },
      {
        id: 'study-005',
        modality: 'MR',
        fileKey: 'checkerboard',
        status: 'InReview',
        ownerId: 'reviewer-b',
        reviewNote: null,
      },
      {
        id: 'study-006',
        modality: 'CT',
        fileKey: 'gradient',
        status: 'Completed',
        ownerId: 'reviewer-a',
        reviewNote: 'Seeded complete',
      },
      {
        id: 'study-007',
        modality: 'MR',
        fileKey: 'checkerboard',
        status: 'Completed',
        ownerId: 'reviewer-b',
        reviewNote: 'Seeded complete',
      },
      {
        id: 'study-008',
        modality: 'OT',
        fileKey: 'gradient',
        status: 'Unassigned',
        ownerId: null,
        reviewNote: null,
      },
    ]);
    expect(studies[0]?.createdAt.toISOString()).toBe('2026-10-07T09:00:00.000Z');
    expect(studies[7]?.createdAt.toISOString()).toBe('2026-10-07T09:07:00.000Z');
  });

  it('re-running seed never overwrites existing rows', async () => {
    await resetTestDb(prisma);
    await prisma.study.update({
      where: { id: 'study-001' },
      data: { status: 'InReview', ownerId: 'reviewer-a', version: 7 },
    });
    const r = await seed(prisma);
    expect(r.created).toBe(0);
    expect(await prisma.study.findUnique({ where: { id: 'study-001' } })).toMatchObject({
      status: 'InReview',
      version: 7,
    });
  });
});
