import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
