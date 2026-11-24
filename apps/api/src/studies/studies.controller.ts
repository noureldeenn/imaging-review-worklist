import { createReadStream } from 'node:fs';
import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiError } from '../common/api-error';
import { ApiErrorResponse, STUDY_REF, zodSchema } from '../common/openapi';
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
import { MAX_UPLOAD_BYTES } from './dicom-upload';
import { StudiesService } from './studies.service';

// @types/express is not installed; only setHeader is needed.
type HeaderSetter = { setHeader(name: string, value: string | number): unknown };

type UploadRequest = AsyncIterable<Buffer> & { headers: Record<string, string | undefined> };
const tooLarge = () => new ApiError(413, 'REQUEST_REJECTED', 'The file is too large');

const STUDY_OK = { schema: STUDY_REF };
const NOT_FOUND = [
  404,
  'Study not found',
  { code: 'STUDY_NOT_FOUND', message: 'Study not found' },
] as const;
const BAD_REQUEST = [
  400,
  'Invalid request',
  { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
] as const;
const MUTATION_ERRORS = () =>
  applyDecorators(
    ApiErrorResponse(...BAD_REQUEST),
    ApiErrorResponse(403, 'Study is owned by another reviewer', {
      code: 'NOT_OWNER',
      message: 'Study is claimed by another reviewer',
    }),
    ApiErrorResponse(...NOT_FOUND),
    ApiErrorResponse(409, 'Study is not in a state that allows this transition', {
      code: 'INVALID_STATE',
      message: 'Study is not in the required state',
    }),
    ApiErrorResponse(412, 'expectedVersion is stale; response carries the current study', {
      code: 'STALE_VERSION',
      message: 'Study was modified by someone else',
    }),
  );

@ApiTags('studies')
@Controller('studies')
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get()
  @ApiOperation({ summary: 'List studies, optionally filtered by status and modality' })
  @ApiQuery({ name: 'status', required: false, enum: ['Unassigned', 'InReview', 'Completed'] })
  @ApiQuery({ name: 'modality', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Matching studies',
    schema: { type: 'array', items: STUDY_REF },
  })
  @ApiErrorResponse(...BAD_REQUEST)
  list(
    @Query(new ZodValidationPipe(ListStudiesQuery)) query: ListStudiesQueryInput,
  ): Promise<StudyDto[]> {
    return this.studies.list(query);
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload one DICOM image (raw request body) as a new Unassigned study',
  })
  @ApiConsumes('application/dicom')
  @ApiResponse({ status: 201, description: 'The new study', ...STUDY_OK })
  @ApiErrorResponse(...BAD_REQUEST)
  @ApiErrorResponse(413, 'File is larger than the upload limit', {
    code: 'REQUEST_REJECTED',
    message: 'The file is too large',
  })
  async upload(@Req() req: UploadRequest): Promise<StudyDto> {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw tooLarge();
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) throw tooLarge();
      chunks.push(chunk);
    }
    return this.studies.upload(Buffer.concat(chunks));
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download the DICOM file for a study' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'DICOM file',
    content: {
      'application/dicom': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiErrorResponse(...NOT_FOUND)
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
  @ApiOperation({ summary: 'Get one study' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The study', ...STUDY_OK })
  @ApiErrorResponse(...NOT_FOUND)
  getOne(@Param('id') id: string): Promise<StudyDto> {
    return this.studies.getOne(id);
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Claim an unassigned study for review (optimistic concurrency)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: zodSchema(ClaimBody) })
  @ApiResponse({ status: 200, description: 'Claimed study', ...STUDY_OK })
  @MUTATION_ERRORS()
  @HttpCode(200)
  claim(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ClaimBody)) body: ClaimBodyInput,
  ): Promise<StudyDto> {
    return this.studies.claim(id, body);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a claimed study with a review note' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: zodSchema(CompleteBody) })
  @ApiResponse({ status: 200, description: 'Completed study', ...STUDY_OK })
  @MUTATION_ERRORS()
  @HttpCode(200)
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CompleteBody)) body: CompleteBodyInput,
  ): Promise<StudyDto> {
    return this.studies.complete(id, body);
  }
}
