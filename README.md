# ROS TypeScript monorepo

This repository is home to several TypeScript-based NPM packages for ROS 1 and ROS 2 support.

| Package                                                                                                      | License    | Version                                                                                                                                                                  | Description                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [`@foxglove/ros1`](./packages/ros1)                                                                          | MIT        | [![@foxglove/ros1 on NPM](https://img.shields.io/npm/v/@foxglove/ros1)](https://www.npmjs.com/package/@foxglove/ros1)                                                    | Standalone TypeScript implementation of the ROS 1 protocol using `@foxglove/xmlrpc` with a pluggable transport layer |
| [`@foxglove/rosbag`](./packages/rosbag) ([API docs](https://foxglove.github.io/ros-typescript/rosbag-docs/)) | Apache-2.0 | [![@foxglove/rosbag on NPM](https://img.shields.io/npm/v/@foxglove/rosbag)](https://www.npmjs.com/package/@foxglove/rosbag)                                              | Node.js & browser compatible module for reading rosbag binary data files                                             |
| [`@foxglove/rosbag2`](./packages/rosbag2)                                                                    | MIT        | [![@foxglove/rosbag2 on NPM](https://img.shields.io/npm/v/@foxglove/rosbag2)](https://www.npmjs.com/package/@foxglove/rosbag2)                                           | ROS 2 legacy SQLite bag reader abstract implementation                                                               |
| [`@foxglove/rosbag2-node`](./packages/rosbag2-node)                                                          | MIT        | [![@foxglove/rosbag2-node on NPM](https://img.shields.io/npm/v/@foxglove/rosbag2-node)](https://www.npmjs.com/package/@foxglove/rosbag2-node)                            | ROS 2 legacy SQLite bag reader for Node.js                                                                           |
| [`@foxglove/rosbag2-web`](./packages/rosbag2-web)                                                            | MIT        | [![@foxglove/rosbag2-web on NPM](https://img.shields.io/npm/v/@foxglove/rosbag2-web)](https://www.npmjs.com/package/@foxglove/rosbag2-web)                               | ROS 2 legacy SQLite bag reader for the browser                                                                       |
| [`@foxglove/rosmsg`](./packages/rosmsg)                                                                      | MIT        | [![@foxglove/rosmsg on NPM](https://img.shields.io/npm/v/@foxglove/rosmsg)](https://www.npmjs.com/package/@foxglove/rosmsg)                                              | ROS 1 and ROS 2 message definition parser                                                                            |
| [`@foxglove/rosmsg-msgs-common`](./packages/rosmsg-msgs-common)                                              | MIT        | [![@foxglove/rosmsg-msgs-common on NPM](https://img.shields.io/npm/v/@foxglove/rosmsg-msgs-common)](https://www.npmjs.com/package/@foxglove/rosmsg-msgs-common)          | Common ROS message definitions using `@foxglove/rosmsg`                                                              |
| [`@foxglove/rosmsg-serialization`](./packages/rosmsg-serialization)                                          | MIT        | [![@foxglove/rosmsg-serialization on NPM](https://img.shields.io/npm/v/@foxglove/rosmsg-serialization)](https://www.npmjs.com/package/@foxglove/rosmsg-serialization)    | ROS 1 message serialization                                                                                          |
| [`@foxglove/rosmsg2-serialization`](./packages/rosmsg2-serialization)                                        | MIT        | [![@foxglove/rosmsg2-serialization on NPM](https://img.shields.io/npm/v/@foxglove/rosmsg2-serialization)](https://www.npmjs.com/package/@foxglove/rosmsg2-serialization) | ROS 2 message serialization using `@foxglove/cdr`                                                                    |
| [`@foxglove/rostime`](./packages/rostime)                                                                    | MIT        | [![@foxglove/rostime on NPM](https://img.shields.io/npm/v/@foxglove/rostime)](https://www.npmjs.com/package/@foxglove/rostime)                                           | ROS Time and Duration primitives and helper methods                                                                  |
| [`@foxglove/xmlrpc`](./packages/xmlrpc)                                                                      | MIT        | [![@foxglove/xmlrpc on NPM](https://img.shields.io/npm/v/@foxglove/xmlrpc)](https://www.npmjs.com/package/@foxglove/xmlrpc)                                              | XMLRPC client and server with pluggable server backend                                                               |

## Development

- `yarn lint`: run lint on specified file(s), or all files if not specified
- `yarn build`: build all packages in topological order
- `yarn test`: run all tests

## Publishing

Packages are automatically published a tag named `packagename/vX.Y.Z` is pushed. You can use the [GitHub Releases UI](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release) to create a release and tag.

## Stay in touch

Join our [Discord community](https://foxglove.dev/chat) to ask questions, share feedback, and stay up to date on what our team is working on.
