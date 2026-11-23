import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiErrorFilter } from './common/api-error.filter';
import { setupOpenApi } from './common/openapi';
import { requestIdMiddleware } from './common/request-id.middleware';
import type { AppConfig } from './config';

type Next = () => void;
type MiddlewareLike = (req: never, res: never, next: Next) => void;

function isDocsPath(url = ''): boolean {
  const path = url.split('?')[0] ?? '';
  return path === '/docs' || path.startsWith('/docs/');
}

/**
 * Everything that shapes HTTP behaviour lives here so main.ts and the test app cannot drift.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrorFilter());
  app.use(requestIdMiddleware);

  const strict = helmet() as MiddlewareLike;
  // Scalar's UI loads its bundle from a CDN with inline config, which the default CSP blocks.
  const docs = helmet({ contentSecurityPolicy: false }) as MiddlewareLike;
  app.use((req: { url?: string }, res: never, next: Next) => {
    (isDocsPath(req.url) ? docs : strict)(req as never, res, next);
  });

  app.enableCors({ origin: [config.webOrigin], exposedHeaders: ['X-Request-Id'] });
  if (config.apiDocsEnabled) setupOpenApi(app);
}
