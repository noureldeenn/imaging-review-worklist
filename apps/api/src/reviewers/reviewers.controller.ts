import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('reviewers')
@Controller('reviewers')
export class ReviewersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List reviewers' })
  @ApiResponse({
    status: 200,
    description: 'Reviewers ordered by id',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
    },
  })
  list(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.reviewer.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }
}
