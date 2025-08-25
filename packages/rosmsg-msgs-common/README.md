# rosmsg-msgs-common

[![npm version](https://img.shields.io/npm/v/@foxglove/rosmsg-msgs-common.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rosmsg-msgs-common)

This library exports a map of ROS 1 and ROS 2 datatype string keys to [@foxglove/message-definition](https://github.com/foxglove/message-definition) `MessageDefinition` values for most common ROS 1 and ROS 2 message definitions. The ROS 1 message definitions were extracted from the `ros:noetic-robot-focal` Docker container using the `gendeps --cat` command. ROS 2 message definitions were extracted from [rcl_interfaces](https://github.com/ros2/rcl_interfaces), [common_interfaces](https://github.com/ros2/common_interfaces), and [unique_identifier_msgs](https://github.com/ros2/unique_identifier_msgs) repository branches using the [gendeps2](https://github.com/foxglove/rosmsg/blob/main/src/gendeps2.ts) utility.

## License

@foxglove/rosmsg-msgs-common is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Updating message definitions from URLs

Use the workspace script to fetch additional `.msg` files and inline their dependencies across all `msgdefs/ros2*` directories.

1. Add one or more raw `.msg` URLs to `packages/rosmsg-msgs-common/scripts/extra-message-def-urls.txt`.
   - One URL per line; lines starting with `#` are comments.
   - URLs must contain `/<package>/msg/<MessageName>.msg` (for example: `/grid_map_msgs/msg/GridMap.msg`).
2. Run the update script:
   - From the repo root:
     ```bash
     yarn workspace @foxglove/rosmsg-msgs-common update:msgdefs:urls
     ```
   - Or from the package directory `packages/rosmsg-msgs-common`:
     ```bash
     yarn update:msgdefs:urls
     ```
3. The script will:
   - Download each `.msg` file listed.
   - Write it into the matching location under each `msgdefs/ros2*` directory.
   - Invoke `scripts/gendeps.ts` to inline transitive dependencies (includes/constants) so the files are self-contained.
   - Print which files were updated.
4. Review the changes under `packages/rosmsg-msgs-common/msgdefs/` and commit them.

Notes:

- URLs that do not match the `/<package>/msg/*.msg` structure are skipped.
- If dependency expansion fails for a file, the original content (if any) is restored and an error is printed.

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Stay in touch

Join our [Discord community](https://foxglove.dev/chat) to ask questions, share feedback, and stay up to date on what our team is working on.
