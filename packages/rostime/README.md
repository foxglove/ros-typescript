# @foxglove/rostime

> _ROS (Robot Operating System) Time and Duration primitives and helper methods_

[![npm version](https://img.shields.io/npm/v/@foxglove/rostime.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rostime)

## Introduction

[ROS](https://www.ros.org/) (Robot Operating System) defines two primitive types for dealing with time, `ros::Time` and `ros::Duration` (see http://wiki.ros.org/roscpp/Overview/Time). These are both represented by the same data type, `{ sec: number; nsec: number }` and serialized as a pair of 32-bit integers (seconds, then nanoseconds). This package provides a TypeScript type definition for these types and helper methods for working with ROS time and duration values.

## Usage

```Typescript
import * as rostime from "@foxglove/rostime";

const a = { sec: 1, nsec: 0 };
const b = rostime.fixTime({ sec: 0, nsec: 1e9 });
console.log(`${rostime.toString(a)} == ${rostime.toString(b)} (${rostime.areEqual(a, b)})`);
```

## License

@foxglove/rostime is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Stay in touch

Join our [Slack channel](https://foxglove.dev/slack) to ask questions, share feedback, and stay up to date on what our team is working on.
