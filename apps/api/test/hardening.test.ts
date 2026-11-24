import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createTestApp } from './db';

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('API hardening', () => {
  it('GET /api/readyz reports db up', async () => {
    const res = await request(app.getHttpServer()).get('/api/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });

  it('GET /docs/openapi.json is OpenAPI 3 and documents the claim route with a 412 response', async () => {
    const res = await request(app.getHttpServer()).get('/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(String(res.body.openapi).startsWith('3')).toBe(true);
    expect(res.body.paths['/api/studies/{id}/claim'].post.responses['412']).toBeDefined();
    expect(res.body.components.schemas.ApiError).toBeDefined();
    const ui = await request(app.getHttpServer()).get('/docs');
    expect(ui.status).toBe(200);
    expect(ui.headers['content-type']).toContain('text/html');
  });

  it('responses carry security headers and X-Request-Id', async () => {
    const generated = await request(app.getHttpServer()).get('/api/health');
    expect(generated.headers['x-content-type-options']).toBe('nosniff');
    expect(generated.headers['x-request-id']).toBeTruthy();
    const echoed = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
  });

  it('CORS allows the web origin only', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://evil.test');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('replaces a malformed X-Request-Id with a generated uuid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'bad id!');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes X-Request-Id to the web origin via CORS', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });
});

describe('API hardening - configuration and failure paths', () => {
  it('API_DOCS_ENABLED=false removes /docs and /docs/openapi.json', async () => {
    const off = await createTestApp({ config: { ...loadConfig(), apiDocsEnabled: false } });
    try {
      expect((await request(off.getHttpServer()).get('/docs')).status).toBe(404);
      expect((await request(off.getHttpServer()).get('/docs/openapi.json')).status).toBe(404);
    } finally {
      await off.close();
    }
  });

  it('GET /api/readyz returns 503 when the database is down', async () => {
    const down = await createTestApp({
      prismaOverride: { $queryRaw: () => Promise.reject(new Error('down')) },
    });
    try {
      const res = await request(down.getHttpServer()).get('/api/readyz');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ ok: false, db: 'down' });
    } finally {
      await down.close();
    }
  });
});

describe('error envelope for unrouted and rejected requests', () => {
  it('GET /api/nope is 404 NOT_FOUND, not STUDY_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });

  it('an unknown study says the same fixed message on read and mutation paths', async () => {
    const read = await request(app.getHttpServer()).get('/api/studies/ghost-1');
    const mutate = await request(app.getHttpServer())
      .post('/api/studies/ghost-1/claim')
      .send({ reviewerId: 'reviewer-a', expectedVersion: 1 });
    expect(read.body).toEqual({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
    expect(mutate.body).toEqual({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
  });

  it('other framework 4xx (413 oversized body) use REQUEST_REJECTED without the framework message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/studies/study-001/claim')
      .send({ reviewerId: 'x'.repeat(200_000), expectedVersion: 1 });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ code: 'REQUEST_REJECTED', message: 'Request rejected' });
  });
});
