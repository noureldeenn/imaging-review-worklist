import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  await app.listen(loadConfig().port);
}

void bootstrap();
