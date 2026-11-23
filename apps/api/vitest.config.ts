import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    environment: 'node',
  },
});

export default config;
