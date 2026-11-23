import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

const fixture = (name: string) => readFile(path.resolve(__dirname, '../../../fixtures', name));

const getBytes = (url: string) =>
  request(app.getHttpServer())
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

describe('GET /api/studies/:id/file', () => {
  it('streams the mapped fixture bytes for study-002 (checkerboard)', async () => {
    const res = await getBytes('/api/studies/study-002/file');
    const expected = await fixture('checkerboard.dcm');
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, expected)).toBe(0);
    expect(res.headers['content-type']).toContain('application/dicom');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-length']).toBe(String(expected.length));
  });

  it('serves the corrupt fixture bytes for study-003 unchanged (52 bytes)', async () => {
    const res = await getBytes('/api/studies/study-003/file');
    const expected = await fixture('corrupt.dcm');
    expect(res.status).toBe(200);
    expect((res.body as Buffer).length).toBe(52);
    expect(Buffer.compare(res.body as Buffer, expected)).toBe(0);
  });

  it('404 STUDY_NOT_FOUND for unknown id', async () => {
    const res = await request(app.getHttpServer()).get('/api/studies/nope/file');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STUDY_NOT_FOUND');
  });

  it('path-like ids cannot escape', async () => {
    const res = await request(app.getHttpServer()).get('/api/studies/..%2F..%2Fpackage.json/file');
    expect(res.status).toBe(404);
  });
});
