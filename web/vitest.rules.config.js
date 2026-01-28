import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/rules/**/*.test.{js,jsx}'],
  },
});
