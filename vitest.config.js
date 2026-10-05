// Vitest (Unit-Tests unter tests/*.test.js). Bewusst getrennt von
// vite.config.js (Library-Build): nur Alias "@" und jsdom.
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
