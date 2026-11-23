import { Module } from '@nestjs/common';
import { ReviewersController } from './reviewers.controller';

@Module({ controllers: [ReviewersController] })
export class ReviewersModule {}
