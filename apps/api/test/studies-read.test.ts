import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, createTestPrisma, resetTestDb } from './db';

let app: INestApplication;
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createTestPrisma();
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetTestDb(prisma);
});

const get = (path: string) => request(app.getHttpServer()).get(path);

describe('GET /api/reviewers', () => {
  it('returns both seeded reviewers', async () => {
    const res = await get('/api/reviewers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'reviewer-a', name: 'Reviewer A' },
      { id: 'reviewer-b', name: 'Reviewer B' },
    ]);
  });
});

describe('GET /api/studies', () => {
  it('returns all 8 ordered by createdAt then id and exposes no fileKey', async () => {
    const res = await get('/api/studies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    const rows = res.body as Array<{ id: string; createdAt: string }>;
    const sorted = [...rows].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    expect(rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    for (const row of rows) expect(row).not.toHaveProperty('fileKey');
  });

  it('AND-combines status and modality', async () => {
    const res = await get('/api/studies?status=InReview&modality=CT');
    expect((res.body as Array<{ id: string }>).map((r) => r.id)).toEqual(['study-004']);
  });

  it('treats empty modality as no filter', async () => {
    const res = await get('/api/studies?modality=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
  });

  it('rejects an unknown status with 400 VALIDATION_ERROR', async () => {
    const res = await get('/api/studies?status=Bogus');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('caps results at 100', async () => {
    await prisma.study.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        id: `bulk-${String(i).padStart(3, '0')}`,
        modality: 'OT',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        status: 'Unassigned' as const,
        fileKey: `bulk-${i}.dcm`,
      })),
    });
    const res = await get('/api/studies');
    expect(res.body).toHaveLength(100);
  });
});

describe('GET /api/studies/:id', () => {
  it('returns metadata, ownership and version', async () => {
    const res = await get('/api/studies/study-004');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'study-004',
      modality: 'CT',
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 1,
    });
    expect(res.body).not.toHaveProperty('fileKey');
  });

  it('404 STUDY_NOT_FOUND', async () => {
    const res = await get('/api/studies/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STUDY_NOT_FOUND');
  });
});
