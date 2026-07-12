import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
