/* eslint-disable */
// Runs a command with DATABASE_URL defaulted to the local dev database, so a fresh clone
// works without an apps/api/.env. An exported DATABASE_URL or an apps/api/.env still wins.
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const hasEnvFile = existsSync(join(__dirname, '..', '.env'));
if (!process.env.DATABASE_URL && !hasEnvFile) {
  process.env.DATABASE_URL = 'postgresql://imaging:imaging@localhost:5432/imaging';
}
const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
process.exit(result.status === null ? 1 : result.status);
