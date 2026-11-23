import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ApiError, type ApiErrorBody } from './api-error';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

function toBody(exception: HttpException): unknown {
  if (exception instanceof ApiError) return exception.getResponse();
  const status = exception.getStatus();
  let body: ApiErrorBody;
  if (status === 400) body = { code: 'VALIDATION_ERROR', message: 'Malformed request' };
  else if (status === 404) body = { code: 'STUDY_NOT_FOUND', message: 'Not found' };
  else body = { code: 'INTERNAL', message: exception.message };
  return body;
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<JsonResponse>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(toBody(exception));
      return;
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    const body: ApiErrorBody = { code: 'INTERNAL', message: 'Unexpected error' };
    res.status(500).json(body);
  }
}
