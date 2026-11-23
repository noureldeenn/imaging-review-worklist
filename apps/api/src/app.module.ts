import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging';
import { loadConfig } from './config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewersModule } from './reviewers/reviewers.module';
import { StudiesModule } from './studies/studies.module';

@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerParams(loadConfig())),
    PrismaModule,
    ReviewersModule,
    StudiesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
