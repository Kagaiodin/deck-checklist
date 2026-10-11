import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate config from vite.config.ts so the Cloudflare Workers plugin
// doesn't interfere with the jsdom test environment.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    env: {
      VITE_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
    },
    coverage: {
      // Floors sit a few points under current coverage (Oct 2026: ~83/80/81/86)
      // so `npm run test:coverage` fails on real regressions, not normal churn.
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 77,
        lines: 82,
      },
    },
  },
});
