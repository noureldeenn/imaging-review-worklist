import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
  // The DICOM loader spawns its decode worker via `new URL(..., import.meta.url)`;
  // pre-bundling would break that URL, and the worker is an ES module. Because
  // the loader is excluded, its CommonJS dependencies (wasm codec glue,
  // dicom-parser) must be pre-bundled explicitly so the dev server serves them
  // as ESM with a default export. `@cornerstonejs/core` and
  // `@cornerstonejs/metadata` are pre-bundled together so the loader and core
  // share ONE metadata provider registry (otherwise the loader registers its
  // providers in a second copy and every image fails with "no pixel data").
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      '@cornerstonejs/core',
      '@cornerstonejs/metadata',
      'dicom-parser',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
