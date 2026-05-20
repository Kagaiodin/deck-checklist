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
  },
});
