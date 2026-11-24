import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// Defaults match `npm run dev`; E2E_API_PORT lets a machine that already has
// something on :4000 run the suite (the web dev server proxies /api to it).
const apiPort = process.env.E2E_API_PORT ?? '4000';
const apiUrl = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // The first open of a study in each fresh browser context loads the lazy Cornerstone
  // chunk from the Vite dev server; give a cold or slow machine room.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm -w apps/api run start',
      cwd: repoRoot,
      // Uploads made by the suite go to a throwaway folder, never the real local-dicom/.
      env: {
        NODE_ENV: 'test',
        PORT: apiPort,
        LOCAL_DICOM_DIR: path.join(tmpdir(), 'imaging-e2e-dicom'),
      },
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: 'npm -w apps/web run dev -- --port 5173 --strictPort',
      cwd: repoRoot,
      env: { API_PROXY_TARGET: apiUrl },
      url: 'http://localhost:5173',
      reuseExistingServer: false,
    },
  ],
});
