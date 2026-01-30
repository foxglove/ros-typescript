// @ts-check

const foxglove = require("@foxglove/eslint-plugin");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: [
      "**/dist",
      "packages/rosbag/docs",
      "**/*.d.ts",
      "packages/rosmsg-serialization/bench/**",
      "packages/rosbag/typings/**",
    ],
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
        project: true,
      },
    },
  },
  ...foxglove.configs.typescript.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["packages/ros1/**"],
    rules: {
      "@foxglove/prefer-hash-private": "off",
    },
  },
  {
    files: ["packages/rosbag/**"],
    rules: {
      "@foxglove/prefer-hash-private": "off",
    },
  },
  {
    files: ["packages/xmlrpc/**"],
    rules: {
      "@foxglove/prefer-hash-private": "off",
    },
  },
);
