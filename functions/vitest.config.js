export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    setupFiles: ['src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
    },
  },
};
