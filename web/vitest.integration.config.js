import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, 'src/__tests__/integration/setup.js')],
    include: ['src/__tests__/integration/**/*.test.js'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
