import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Hook tests render real components and need a DOM — opted in per
    // file with a `// @vitest-environment jsdom` pragma rather than
    // switching every test (including the plain service/contract tests)
    // to jsdom globally.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
