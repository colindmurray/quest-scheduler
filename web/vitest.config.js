import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/__tests__/setup.js",
    clearMocks: true,
    restoreMocks: true,
    include: ["src/**/*.test.{js,jsx}"],
    exclude: ["e2e/**", "src/__tests__/integration/**", "src/__tests__/rules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
