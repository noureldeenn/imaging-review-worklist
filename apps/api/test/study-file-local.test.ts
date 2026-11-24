import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPrisma } from './db';

const UUID = '0b8f6d9e-1c2a-4f3b-8a7d-5e6f7a8b9c0d';
const MISSING_UUID = '11111111-2222-4333-8444-555555555555';
const INSERTED = ['local-t01', 'local-t02', 'local-t03', 'local-t04', 'local-t05', 'local-t06'];
const BYTES = Buffer.from([0x44, 0x49, 0x43, 0x4d, 0, 1, 2, 3, 255, 254]);

let app: INestApplication;
let prisma: PrismaClient;
let dir: string;
let previousDir: string | undefined;

async function insert(id: string, fileKey: string): Promise<void> {
  await prisma.study.create({
    data: { id, modality: 'CT', createdAt: new Date('2026-11-01T09:00:00Z'), fileKey },
  });
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'local-dicom-'));
  previousDir = process.env.LOCAL_DICOM_DIR;
  process.env.LOCAL_DICOM_DIR = dir;
  await writeFile(path.join(dir, `${UUID}.dcm`), BYTES);
  prisma = createTestPrisma();
  app = await createTestApp();
  await insert('local-t01', `local:${UUID}`);
  await insert('local-t02', 'local:../../etc/passwd');
  await insert('local-t03', `local:${UUID.toUpperCase()}`);
  await insert('local-t04', `local:${UUID}.dcm`);
  await insert('local-t05', `local:${MISSING_UUID}`);
  await insert('local-t06', `local:${UUID}/../x`);
});

afterAll(async () => {
  await prisma.study.deleteMany({ where: { id: { in: INSERTED } } });
  await app.close();
  await prisma.$disconnect();
  if (previousDir === undefined) delete process.env.LOCAL_DICOM_DIR;
  else process.env.LOCAL_DICOM_DIR = previousDir;
  await rm(dir, { recursive: true, force: true });
});

describe('GET /api/studies/:id/file for local imports', () => {
  it('serves the exact bytes of a local:<uuid> study', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/studies/local-t01/file')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, BYTES)).toBe(0);
    expect(res.headers['content-type']).toContain('application/dicom');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(['local-t02', 'local-t03', 'local-t04', 'local-t06'])(
    'malformed key on %s is 404',
    async (id) => {
      const res = await request(app.getHttpServer()).get(`/api/studies/${id}/file`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('STUDY_NOT_FOUND');
    },
  );

  it('a valid key whose file is missing is 404, not 500', async () => {
    const res = await request(app.getHttpServer()).get('/api/studies/local-t05/file');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STUDY_NOT_FOUND');
  });

  it('never exposes fileKey in the DTO', async () => {
    const res = await request(app.getHttpServer()).get('/api/studies/local-t01');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('local:');
    expect(res.body).not.toHaveProperty('fileKey');
  });
});
