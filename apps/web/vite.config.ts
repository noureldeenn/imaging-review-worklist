import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:4000' },
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Vite's dynamic-import helper is used by the entry; keep it out of
          // the heavy chunk.
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload'))
            return 'vendor';
          if (!id.includes('node_modules')) return undefined;
          // Only the app's own runtime deps are 'vendor'; everything else under
          // node_modules is a transitive dependency of the lazy viewer (vtk.js,
          // codecs, ...) and belongs with Cornerstone so the entry stays small.
          // New app runtime dependencies must be added to this regex, or they land in the lazy chunk.
          if (
            /node_modules\/(react|react-dom|scheduler|@tanstack|zustand|zod|@radix-ui|@floating-ui|class-variance-authority|clsx|tailwind-merge|lucide-react)\//.test(
              id,
            )
          )
            return 'vendor';
          return 'cornerstone';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
