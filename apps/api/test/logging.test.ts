import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildPinoHttpOptions } from '../src/common/logging';
import { loadConfig } from '../src/config';

interface LogEntry {
  req: {
    body: { patientName: string; nested: { mrn: string } };
    headers: { authorization: string; cookie: string };
  };
}

describe('request logging redaction', () => {
  it('redacts PHI body fields (incl. nested) and credential headers, never leaking raw values', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const built = buildPinoHttpOptions(loadConfig(), stream);
    if (!Array.isArray(built)) throw new Error('expected [options, stream]');
    const logger = pinoHttp(built[0], built[1]);

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => {
        (req as IncomingMessage & { body?: unknown }).body = JSON.parse(data);
        logger(req, res);
        res.end('ok');
      });
    });
    await request(server)
      .post('/x')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'sid=secret-cookie')
      .send({ patientName: 'Jane-Raw', nested: { mrn: 'MRN-Raw' } });
    await new Promise((r) => setTimeout(r, 100));

    const out = lines.join('');
    expect(out).toContain('[REDACTED]');
    for (const raw of ['Jane-Raw', 'MRN-Raw', 'secret-token', 'secret-cookie']) {
      expect(out).not.toContain(raw);
    }
    const entry = JSON.parse(lines[0] ?? '{}') as LogEntry;
    expect(entry.req.body.patientName).toBe('[REDACTED]');
    expect(entry.req.body.nested.mrn).toBe('[REDACTED]');
    expect(entry.req.headers.authorization).toBe('[REDACTED]');
    expect(entry.req.headers.cookie).toBe('[REDACTED]');
  });
});
