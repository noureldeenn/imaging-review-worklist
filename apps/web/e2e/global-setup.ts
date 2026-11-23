import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function run(command: string): void {
  const result = spawnSync(command, { cwd: repoRoot, shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`global setup: "${command}" failed (exit ${String(result.status)})`);
  }
}

/** Migrates the test database and truncates + reseeds it before the suite. */
export default function globalSetup(): void {
  run('npm run db:migrate:test');
  run('npm -w apps/api run db:reset:test');
}
