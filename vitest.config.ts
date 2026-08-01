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
  },
});
