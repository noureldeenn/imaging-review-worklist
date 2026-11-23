import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPrisma, resetTestDb } from './db';

const prisma = createTestPrisma();

beforeAll(async () => {
  await resetTestDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('persistence', () => {
  it('ownership, note and version survive an application restart', async () => {
    const app1 = await createTestApp();
    const c = await request(app1.getHttpServer())
      .post('/api/studies/study-001/claim')
      .send({ reviewerId: 'reviewer-a', expectedVersion: 1 });
    expect(c.status).toBe(200);
    const d = await request(app1.getHttpServer())
      .post('/api/studies/study-001/complete')
      .send({ reviewerId: 'reviewer-a', expectedVersion: 2, reviewNote: 'persisted' });
    expect(d.status).toBe(200);
    await app1.close();

    const app2 = await createTestApp();
    try {
      const res = await request(app2.getHttpServer()).get('/api/studies/study-001');
      expect(res.body).toMatchObject({
        status: 'Completed',
        ownerId: 'reviewer-a',
        reviewNote: 'persisted',
        version: 3,
      });
    } finally {
      await app2.close();
    }
  });
});
