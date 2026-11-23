import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ClaimBody,
  CompleteBody,
  ListStudiesQuery,
  type ClaimBodyInput,
  type CompleteBodyInput,
  type ListStudiesQueryInput,
  type StudyDto,
} from './studies.dto';
import { StudiesService } from './studies.service';

@Controller('studies')
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListStudiesQuery)) query: ListStudiesQueryInput,
  ): Promise<StudyDto[]> {
    return this.studies.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<StudyDto> {
    return this.studies.getOne(id);
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ClaimBody)) body: ClaimBodyInput,
  ): Promise<StudyDto> {
    return this.studies.claim(id, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CompleteBody)) body: CompleteBodyInput,
  ): Promise<StudyDto> {
    return this.studies.complete(id, body);
  }
}
