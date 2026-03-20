import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));
const files = ["src/**/*.ts", "drizzle.config.ts"];

function scopeConfig(config) {
  return {
    ...config,
    files,
  };
}

function scopeConfigs(configs) {
  return configs.map(scopeConfig);
}

export default [
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  scopeConfig(js.configs.recommended),
  ...scopeConfigs(tseslint.configs.recommendedTypeChecked),
  {
    files,
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        Bun: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    rules: {
      curly: "error",
      eqeqeq: "error",
      "no-undef": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
          ignoreIIFE: true,
        },
      ],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: true,
        },
      ],
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },
];
