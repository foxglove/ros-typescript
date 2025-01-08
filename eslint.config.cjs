// @ts-check

const foxglove = require("@foxglove/eslint-plugin");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["**/dist", "packages/rosbag/docs"],
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
    languageOptions: {
      parserOptions: {
        project: ["packages/xmlrpc/tsconfig.json", "packages/xmlrpc/tsconfig.dts.json"],
      },
    },
  },
  {
    files: ["packages/xmlrpc/examples/**"],
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
  },
  {
    files: ["packages/ros1/**"],
    languageOptions: {
      parserOptions: {
        project: ["packages/ros1/tsconfig.json", "packages/ros1/tsconfig.dts.json"],
      },
    },
  },
  {
    files: ["packages/ros1/examples/**"],
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
  },
  {
    files: ["packages/rosmsg-serialization/**"],
    languageOptions: {
      parserOptions: {
        project: "packages/rosmsg-serialization/tsconfig.eslint.json",
      },
    },
  },
);
