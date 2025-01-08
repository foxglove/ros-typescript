# @foxglove/rosmsg2-serialization

> _ROS 2 (Robot Operating System) message serialization, for reading and writing bags and network messages_

[![npm version](https://img.shields.io/npm/v/@foxglove/rosmsg2-serialization.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rosmsg2-serialization)

## MessageReader

Message reader deserializes ROS 2 CDR messages into plain objects. The messages are fully deserialized.

```typescript
import { MessageReader } from "@foxglove/rosmsg2-serialization";

// message definition comes from `parse()` in @foxglove/rosmsg
const reader = new MessageReader(messageDefinition);

// specify a different `timeType` for time objects compatible with ROS 1 and @foxglove/rostime
const reader = new MessageReader(messageDefinition, { timeType: "sec,nsec" });

// deserialize a buffer into an object
const message = reader.readMessage([0x00, 0x01, ...]);

// access message fields
message.header.stamp;
```

## MessageWriter

Convert an object, array, or primitive value into binary data using ROS 2 CDR message serialization.

```Typescript
import { MessageWriter } from "@foxglove/rosmsg2-serialization";

// message definition comes from `parse()` in @foxglove/rosmsg
const writer = new MessageWriter(pointStampedMessageDefinition);

// serialize the passed in object to a Uint8Array as a geometry_msgs/PointStamped message
const uint8Array = writer.writeMessage({
  header: {
    stamp: { sec: 0, nanosec: 0 },
    frame_id: ""
  },
  x: 1,
  y: 0,
  z: 0
});
```

### Test

`yarn test`

## License

@foxglove/rosmsg2-serialization is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Stay in touch

Join our [Discord community](https://foxglove.dev/chat) to ask questions, share feedback, and stay up to date on what our team is working on.
