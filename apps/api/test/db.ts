import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';
import { loadConfig, type AppConfig } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/app-setup';
import { AppModule } from '../src/app.module';

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: loadConfig().databaseUrl } } });
}

export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Study", "Reviewer" CASCADE');
  await seed(prisma);
}

export interface TestAppOptions {
  config?: Partial<AppConfig>;
  prismaOverride?: unknown;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.prismaOverride !== undefined) {
    builder = builder.overrideProvider(PrismaService).useValue(options.prismaOverride);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, { ...loadConfig(), ...options.config });
  await app.init();
  return app;
}
