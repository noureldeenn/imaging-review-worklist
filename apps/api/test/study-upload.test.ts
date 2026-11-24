import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPrisma } from './db';

const FIXTURES = path.resolve(__dirname, '../../../fixtures');

let app: INestApplication;
let prisma: PrismaClient;
let dir: string;
let previousDir: string | undefined;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'upload-dicom-'));
  previousDir = process.env.LOCAL_DICOM_DIR;
  process.env.LOCAL_DICOM_DIR = dir;
  prisma = createTestPrisma();
  app = await createTestApp();
});

afterAll(async () => {
  await prisma.study.deleteMany({ where: { id: { startsWith: 'upload-' } } });
  await prisma.$disconnect();
  await app.close();
  if (previousDir === undefined) delete process.env.LOCAL_DICOM_DIR;
  else process.env.LOCAL_DICOM_DIR = previousDir;
  await rm(dir, { recursive: true, force: true });
});

const post = (body: Buffer) =>
  request(app.getHttpServer())
    .post('/api/studies/upload')
    .set('Content-Type', 'application/dicom')
    .send(body);

describe('POST /api/studies/upload', () => {
  it('stores a valid DICOM file as a new Unassigned study that can be downloaded', async () => {
    const bytes = await readFile(path.join(FIXTURES, 'gradient.dcm'));
    const res = await post(bytes);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'Unassigned', version: 1, ownerId: null });
    expect(res.body.id).toMatch(/^upload-[0-9a-f]{8}$/);
    const file = await request(app.getHttpServer())
      .get(`/api/studies/${res.body.id}/file`)
      .buffer(true)
      .parse((r, cb) => {
        const parts: Buffer[] = [];
        r.on('data', (c: Buffer) => parts.push(c));
        r.on('end', () => cb(null, Buffer.concat(parts)));
      });
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, bytes)).toBe(0);
  });

  it('rejects an empty body, non-DICOM bytes and the corrupt fixture without writing a file', async () => {
    const before = (await readdir(dir)).length;
    expect((await post(Buffer.alloc(0))).status).toBe(400);
    const junk = await post(Buffer.from('not a dicom file at all'));
    expect(junk.status).toBe(400);
    expect(junk.body.code).toBe('VALIDATION_ERROR');
    const corrupt = await post(await readFile(path.join(FIXTURES, 'corrupt.dcm')));
    expect(corrupt.status).toBe(400);
    expect((await readdir(dir)).length).toBe(before);
  });
});
