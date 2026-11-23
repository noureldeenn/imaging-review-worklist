import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from './api-error';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        result.error.issues[0]?.message ?? 'Invalid request',
      );
    }
    return result.data;
  }
}
