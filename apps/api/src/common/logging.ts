import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
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
] as const;

export const PHI_REDACT_PATHS = PHI_FIELDS.map((f) => `req.body.${f}`);

export function buildLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.nodeEnv === 'test' ? 'silent' : 'info',
      redact: { paths: [...PHI_REDACT_PATHS], censor: '[REDACTED]' },
      transport: config.nodeEnv !== 'production' ? { target: 'pino-pretty' } : undefined,
      autoLogging: true,
      // The request-id middleware has normally set req.id already; this is a fallback.
      genReqId: (req) => (req.id as string | undefined) ?? randomUUID(),
    },
  };
}
