import { PrismaClient } from '@prisma/client';
import { SEED_REVIEWERS, SEED_STUDIES } from './seed-data';

/** Create-if-absent only: existing rows are never updated. */
export async function seed(prisma: PrismaClient): Promise<{ created: number }> {
  const reviewers = await prisma.reviewer.createMany({
    data: SEED_REVIEWERS,
    skipDuplicates: true,
  });
  const studies = await prisma.study.createMany({
    data: SEED_STUDIES,
    skipDuplicates: true,
  });
  return { created: reviewers.count + studies.count };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { created } = await seed(prisma);
    console.log(`seed: created ${created} row(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
