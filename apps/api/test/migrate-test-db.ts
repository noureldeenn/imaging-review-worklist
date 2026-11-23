import { spawnSync } from 'node:child_process';
import { loadConfig } from '../src/config';

/** Applies committed migrations to the test database (prisma migrate deploy). */
export function migrateTestDb(): void {
  process.env.NODE_ENV = 'test';
  const databaseUrl = loadConfig().databaseUrl;
  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed on the test database (exit ${result.status})`);
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  try {
    migrateTestDb();
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}
