import { createTestPrisma, resetTestDb } from './db';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const prisma = createTestPrisma();
  try {
    await resetTestDb(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
