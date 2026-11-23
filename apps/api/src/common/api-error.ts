import { HttpException } from '@nestjs/common';
import type { StudyDto } from '../studies/studies.dto';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'STUDY_NOT_FOUND'
  | 'STALE_VERSION'
  | 'INVALID_STATE'
  | 'NOT_OWNER';

export interface ApiErrorBody {
  code: ApiErrorCode | 'INTERNAL';
  message: string;
  current?: StudyDto;
}

export class ApiError extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, current?: StudyDto) {
    const body: ApiErrorBody = current ? { code, message, current } : { code, message };
    super(body, status);
  }
}
