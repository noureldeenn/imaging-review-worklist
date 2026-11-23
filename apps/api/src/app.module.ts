import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewersModule } from './reviewers/reviewers.module';
import { StudiesModule } from './studies/studies.module';

@Module({
  imports: [PrismaModule, ReviewersModule, StudiesModule],
  controllers: [HealthController],
})
export class AppModule {}
