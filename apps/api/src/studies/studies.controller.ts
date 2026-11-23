import { createReadStream } from 'node:fs';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
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

// @types/express is not installed; only setHeader is needed.
type HeaderSetter = { setHeader(name: string, value: string | number): unknown };

@Controller('studies')
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListStudiesQuery)) query: ListStudiesQueryInput,
  ): Promise<StudyDto[]> {
    return this.studies.list(query);
  }

  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: HeaderSetter,
  ): Promise<StreamableFile> {
    const { path, size } = await this.studies.getFile(id);
    // Set only after the lookup succeeds so error responses keep the JSON envelope.
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', size);
    return new StreamableFile(createReadStream(path));
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
