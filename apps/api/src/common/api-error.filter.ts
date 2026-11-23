import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiErrorBody } from './api-error';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<JsonResponse>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    const body: ApiErrorBody = { code: 'INTERNAL', message: 'Unexpected error' };
    res.status(500).json(body);
  }
}
