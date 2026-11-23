import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';
import { loadConfig } from '../src/config';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { AppModule } from '../src/app.module';

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: loadConfig().databaseUrl } } });
}

export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Study", "Reviewer" CASCADE');
  await seed(prisma);
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();
  return app;
}
