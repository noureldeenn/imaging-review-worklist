import { Controller, Get, Logger, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

type StatusSetter = { status(code: number): unknown };

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Process is up' })
  check(): { ok: true } {
    return { ok: true };
  }

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness probe (checks database connectivity)' })
  @ApiResponse({ status: 200, description: 'Database reachable' })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async ready(
    @Res({ passthrough: true }) res: StatusSetter,
  ): Promise<{ ok: boolean; db: 'up' | 'down' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: 'up' };
    } catch (err) {
      this.logger.warn(
        `Readiness check failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      res.status(503);
      return { ok: false, db: 'down' };
    }
  }
}
