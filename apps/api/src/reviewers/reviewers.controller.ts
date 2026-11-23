import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('reviewers')
export class ReviewersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.reviewer.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }
}
