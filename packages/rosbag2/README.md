# @foxglove/rosbag2

> _ROS2 (Robot Operating System) legacy SQLite bag reader abstract implementation_

[![npm version](https://img.shields.io/npm/v/@foxglove/rosbag2.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rosbag2)

**NOTICE**: The SQLite rosbag2 recording format has been replaced by [MCAP](https://mcap.dev/). This package is only useful for reading legacy rosbag2 `.db3` files.

**Developers**: Use [@foxglove/rosbag2-node](https://github.com/foxglove/rosbag2-node) or [@foxglove/rosbag2-web](https://github.com/foxglove/rosbag2-web)

This package contains the subset of the full rosbag2 SQLite implementation that can be shared across node.js and web environments. It cannot read rosbag2 `.db3` files on its own. You are probably looking for the [@foxglove/rosbag2-node](https://github.com/foxglove/rosbag2-node) or [@foxglove/rosbag2-web](https://github.com/foxglove/rosbag2-web) package unless you are writing your own bag parsing implementation.

## License

@foxglove/rosbag2 is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Stay in touch

Join our [Slack channel](https://foxglove.dev/slack) to ask questions, share feedback, and stay up to date on what our team is working on.
