import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [{
    name: "text-module",
    transform(source, id) {
      if (id.endsWith(".md")) return `export default ${JSON.stringify(source)};`;
      return null;
    },
  }],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["worker/**/*.ts", "web/js/**/*.js"],
      exclude: ["worker/modules.d.ts"],
      thresholds: {
        statements: 33,
        branches: 34,
        functions: 41,
        lines: 36,
      },
    },
  },
});
