import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import queryPlugin from "@tanstack/eslint-plugin-query";
import importX from "eslint-plugin-import-x";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));
const srcFiles = ["src/**/*.{ts,tsx}"];

function scopeConfig(config) {
  return {
    ...config,
    files: srcFiles,
  };
}

function scopeConfigs(configs) {
  return configs.map(scopeConfig);
}

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "src-tauri/**"],
  },
  scopeConfig(js.configs.recommended),
  ...scopeConfigs(tseslint.configs.recommended),
  scopeConfig(reactPlugin.configs.flat.recommended),
  scopeConfig(reactPlugin.configs.flat["jsx-runtime"]),
  scopeConfig(reactRefresh.configs.vite),
  scopeConfig(sonarjs.configs.recommended),
  scopeConfig(unicorn.configs["flat/recommended"]),
  scopeConfig(importX.flatConfigs.recommended),
  scopeConfig(importX.flatConfigs.typescript),
  {
    files: srcFiles,
    settings: {
      "import-x/resolver": {
        typescript: {
          project: path.resolve(tsconfigRootDir, "tsconfig.app.json"),
        },
      },
    },
  },
  {
    files: srcFiles,
    plugins: {
      "@tanstack/query": queryPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
          ignoreIIFE: true,
        },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/infinite-query-property-order": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/stable-query-client": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
      "react/prop-types": "off",
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/prefer-global-this": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/prefer-string-replace-all": "off",
      "sonarjs/prefer-read-only-props": "off",
      "import-x/default": "off",
    },
  },
  {
    files: ["src/components/editor/nodes/*.tsx", "src/components/ui/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
