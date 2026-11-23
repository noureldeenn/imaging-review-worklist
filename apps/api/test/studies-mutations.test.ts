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

const post = (path: string, body: object) => request(app.getHttpServer()).post(path).send(body);
const claim = (id: string, reviewerId: string, expectedVersion: unknown) =>
  post(`/api/studies/${id}/claim`, { reviewerId, expectedVersion });
const complete = (id: string, reviewerId: string, expectedVersion: unknown, reviewNote: unknown) =>
  post(`/api/studies/${id}/complete`, { reviewerId, expectedVersion, reviewNote });
const row = (id: string) => prisma.study.findUniqueOrThrow({ where: { id } });

describe('POST claim', () => {
  it('claims an Unassigned study: InReview, owner set, version 2', async () => {
    const res = await claim('study-001', 'reviewer-a', 1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'study-001',
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 2,
    });
  });

  it('400 VALIDATION_ERROR when expectedVersion is the string "1"', async () => {
    const res = await claim('study-001', 'reviewer-a', '1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR when expectedVersion is 1.5 or missing', async () => {
    const frac = await claim('study-001', 'reviewer-a', 1.5);
    expect(frac.status).toBe(400);
    expect(frac.body.code).toBe('VALIDATION_ERROR');
    const res = await post('/api/studies/study-001/claim', { reviewerId: 'reviewer-a' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR for unknown reviewerId, study untouched', async () => {
    const res = await claim('study-001', 'ghost', 1);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Unknown reviewer' });
    expect(await row('study-001')).toMatchObject({
      status: 'Unassigned',
      version: 1,
      ownerId: null,
    });
  });

  it('400 VALIDATION_ERROR when expectedVersion exceeds int4 range', async () => {
    const res = await claim('study-001', 'reviewer-a', 3000000000);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('404 STUDY_NOT_FOUND for unknown study', async () => {
    const res = await claim('nope', 'reviewer-a', 1);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STUDY_NOT_FOUND');
  });

  it('412 STALE_VERSION with current record when version is behind', async () => {
    await claim('study-001', 'reviewer-a', 1);
    const res = await claim('study-001', 'reviewer-b', 1);
    expect(res.status).toBe(412);
    expect(res.body.code).toBe('STALE_VERSION');
    expect(res.body.current.version).toBe(2);
    expect(await row('study-001')).toMatchObject({
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 2,
    });
  });

  it('412 carries current.version 1 when the client is ahead', async () => {
    const res = await claim('study-001', 'reviewer-a', 5);
    expect(res.status).toBe(412);
    expect(res.body.current.version).toBe(1);
  });

  it('409 INVALID_STATE when claiming an InReview study with the current version', async () => {
    const res = await claim('study-004', 'reviewer-b', 1);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATE');
    expect(await row('study-004')).toMatchObject({
      status: 'InReview',
      ownerId: 'reviewer-a',
      version: 1,
    });
  });

  it('two concurrent claims from the same version -> exactly one 200 and one 412', async () => {
    const [a, b] = await Promise.all([
      claim('study-001', 'reviewer-a', 1),
      claim('study-001', 'reviewer-b', 1),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 412]);
    const winner = a.status === 200 ? 'reviewer-a' : 'reviewer-b';
    expect(await row('study-001')).toMatchObject({
      status: 'InReview',
      version: 2,
      ownerId: winner,
    });
  });
});

describe('POST complete', () => {
  it('owner completes with current version: Completed, note retained, owner retained, version +1', async () => {
    const res = await complete('study-004', 'reviewer-a', 1, 'looks fine');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'Completed',
      ownerId: 'reviewer-a',
      reviewNote: 'looks fine',
      version: 2,
    });
  });

  it('403 NOT_OWNER when the other reviewer completes with the current version; nothing changes', async () => {
    const res = await complete('study-004', 'reviewer-b', 1, 'x');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_OWNER');
    expect(await row('study-004')).toMatchObject({
      status: 'InReview',
      version: 1,
      reviewNote: null,
    });
  });

  it('412 STALE_VERSION on stale complete; nothing changes', async () => {
    const res = await complete('study-004', 'reviewer-a', 7, 'x');
    expect(res.status).toBe(412);
    expect(res.body.code).toBe('STALE_VERSION');
    expect(res.body.current.version).toBe(1);
    expect(await row('study-004')).toMatchObject({ status: 'InReview', version: 1 });
  });

  it('409 INVALID_STATE completing an Unassigned or Completed study', async () => {
    expect((await complete('study-001', 'reviewer-a', 1, 'x')).status).toBe(409);
    const res = await complete('study-006', 'reviewer-a', 1, 'x');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATE');
  });

  it('400 for empty, whitespace-only and 1001-char notes; nothing changes', async () => {
    for (const note of ['', '   \n ', 'a'.repeat(1001)]) {
      const res = await complete('study-004', 'reviewer-a', 1, note);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await row('study-004')).toMatchObject({
      status: 'InReview',
      version: 1,
      reviewNote: null,
    });
  });

  it('accepts a 1000-char note wrapped in whitespace and stores it trimmed', async () => {
    const note = 'a'.repeat(1000);
    const res = await complete('study-004', 'reviewer-a', 1, `  ${note}\n`);
    expect(res.status).toBe(200);
    expect((await row('study-004')).reviewNote).toBe(note);
  });

  it('Completed is terminal: claim -> 409, complete -> 409', async () => {
    expect((await claim('study-006', 'reviewer-a', 1)).status).toBe(409);
    expect((await complete('study-006', 'reviewer-a', 1, 'x')).status).toBe(409);
  });
});

describe('malformed JSON', () => {
  it('POST claim with invalid JSON body -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/studies/study-001/claim')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
