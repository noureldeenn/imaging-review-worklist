import { applyDecorators } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ApiResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { z } from 'zod';
import { StudyDtoSchema } from '../studies/studies.dto';

type JsonSchema = Record<string, unknown>;

export function zodSchema(schema: z.ZodType, io: 'input' | 'output' = 'input'): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
  }) as JsonSchema;
  delete json.$schema;
  return json;
}

const API_ERROR_REF = { $ref: '#/components/schemas/ApiError' };
export const STUDY_REF = { $ref: '#/components/schemas/Study' };

const API_ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'VALIDATION_ERROR',
        'STUDY_NOT_FOUND',
        'NOT_FOUND',
        'STALE_VERSION',
        'INVALID_STATE',
        'NOT_OWNER',
        'REQUEST_REJECTED',
        'INTERNAL',
      ],
    },
    message: { type: 'string' },
    current: {
      ...STUDY_REF,
      description: 'Latest server copy; present on version conflicts',
    },
  },
};

/** A 4xx/5xx response using the shared error envelope, with a synthetic example. */
export function ApiErrorResponse(
  status: number,
  description: string,
  example: { code: string; message: string },
): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status,
      description,
      content: { 'application/json': { schema: API_ERROR_REF, example } },
    }),
  );
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Imaging Review Worklist API').setVersion('1.0').build(),
  );
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ApiError: API_ERROR_SCHEMA,
      Study: zodSchema(StudyDtoSchema, 'output'),
    },
  };
  return document;
}

interface DocsResponse {
  json(body: unknown): void;
}

export function setupOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  const adapter = app.getHttpAdapter();
  adapter.get('/docs/openapi.json', (_req: unknown, res: DocsResponse) => res.json(document));
  adapter.get('/docs', apiReference({ spec: { content: document } }));
}
