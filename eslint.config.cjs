// @ts-check

const foxglove = require("@foxglove/eslint-plugin");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["**/dist"],
  },
  ...foxglove.configs.base,
  ...foxglove.configs.jest,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "tsconfig.json",
      },
    },
  },
  ...foxglove.configs.typescript.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
);
