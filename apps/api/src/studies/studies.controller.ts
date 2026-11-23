import { Controller, Get, Param, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ListStudiesQuery, type ListStudiesQueryInput, type StudyDto } from './studies.dto';
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
}
