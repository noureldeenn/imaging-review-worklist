export interface AppConfig {
  port: number;
  databaseUrl: string;
}

const DEFAULT_DATABASE_URL = 'postgresql://imaging:imaging@localhost:5432/imaging';
const DEFAULT_DATABASE_URL_TEST = 'postgresql://imaging:imaging@localhost:5432/imaging_test';

export function loadConfig(): AppConfig {
  const isTest = process.env.NODE_ENV === 'test';
  const databaseUrl = isTest
    ? (process.env.DATABASE_URL_TEST ?? DEFAULT_DATABASE_URL_TEST)
    : (process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }
  return { port, databaseUrl };
}
