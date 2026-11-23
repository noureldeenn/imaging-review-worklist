import { migrateTestDb } from './migrate-test-db';

export default function setup(): void {
  migrateTestDb();
}
