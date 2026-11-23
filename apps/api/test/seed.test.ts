import { PrismaClient } from '@prisma/client';
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
    expect(studies.map((s) => s.id)).toEqual([
      'study-001', 'study-002', 'study-003', 'study-004',
      'study-005', 'study-006', 'study-007', 'study-008',
    ]);
    expect(studies[0]?.createdAt.toISOString()).toBe('2026-10-07T09:00:00.000Z');
    expect(studies[7]?.createdAt.toISOString()).toBe('2026-10-07T09:07:00.000Z');
    expect(studies.filter((s) => s.status === 'InReview').map((s) => s.ownerId)).toEqual([
      'reviewer-a',
      'reviewer-b',
    ]);
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
