import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from '../config';

export const PHI_FIELDS = [
  'patientName',
  'patientId',
  'mrn',
  'dob',
  'birthDate',
  'studyDescription',
  'accessionNumber',
  'referringPhysicianName',
  'performingPhysicianName',
  'requestingPhysician',
  'patientAddress',
  'patientPhone',
  'patientEmail',
  'ssn',
  'reviewNote',
] as const;

// Top-level bodies, one level of nesting (`req.body.*.field`), and credential headers.
export const REDACT_PATHS = [
  ...PHI_FIELDS.map((f) => `req.body.${f}`),
  ...PHI_FIELDS.map((f) => `req.body.*.${f}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

export const SAFE_BODY_FIELDS = ['reviewerId', 'expectedVersion'] as const;

/** Returns only allowlisted top-level keys of a plain-object body, or undefined. */
export function pickSafe(
  body: unknown,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

interface SerializedReq {
  id?: unknown;
  method?: unknown;
  url?: unknown;
  headers?: unknown;
  raw?: { body?: unknown };
  body?: unknown;
}

export type PinoHttpOptions = Options | [Options, DestinationStream];

/**
 * Single source of truth for request logging. When `stream` is given (tests) logs go there at
 * `info`, without the pretty transport.
 */
export function buildPinoHttpOptions(
  config: AppConfig,
  stream?: DestinationStream,
): PinoHttpOptions {
  const options: Options = {
    level: stream ? 'info' : config.nodeEnv === 'test' ? 'silent' : 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    transport: !stream && config.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
    autoLogging: true,
    serializers: {
      // Bodies are allowlisted, not denylisted: reviewNote is free text that could carry PHI,
      // so only known-safe scalar fields are ever serialized.
      req: (req: SerializedReq) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: pickSafe(req.raw?.body ?? req.body, SAFE_BODY_FIELDS),
      }),
    },
    // The request-id middleware has normally set req.id already; this is a fallback.
    genReqId: (req) => (req.id as string | undefined) ?? randomUUID(),
  };
  return stream ? [options, stream] : options;
}

export function buildLoggerParams(config: AppConfig): Params {
  return { pinoHttp: buildPinoHttpOptions(config) };
}
