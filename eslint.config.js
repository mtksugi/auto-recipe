import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "cooking-import-output/**",
      "phase0-output/**",
      "phase1-url-output/**",
      "phase2-output/**",
    ],
  },
  {
    files: ["web/js/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      complexity: ["warn", { max: 15 }],
    },
  },
  {
    files: ["worker/**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      complexity: ["warn", { max: 15 }],
    },
  },
  {
    files: ["tests/**/*.ts", "vitest.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
]);
