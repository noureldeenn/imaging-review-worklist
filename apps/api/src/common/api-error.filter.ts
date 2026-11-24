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
  else if (status === 404) body = { code: 'NOT_FOUND', message: 'Not found' };
  else if (status >= 400 && status < 500)
    body = { code: 'REQUEST_REJECTED', message: 'Request rejected' };
  else body = { code: 'INTERNAL', message: exception.message };
  return body;
}

function httpErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const status = (exception as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
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
    // Body-parser and other Express middleware throw http-errors (not HttpException) with a
    // 4xx status, for example 413 for an oversized body. They are the client's fault, not a 500.
    const clientStatus = httpErrorStatus(exception);
    if (clientStatus !== null) {
      const body: ApiErrorBody = { code: 'REQUEST_REJECTED', message: 'Request rejected' };
      res.status(clientStatus).json(body);
      return;
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    const body: ApiErrorBody = { code: 'INTERNAL', message: 'Unexpected error' };
    res.status(500).json(body);
  }
}
