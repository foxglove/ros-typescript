# @foxglove/rosmsg-serialization

> _ROS1 (Robot Operating System) message serialization, for reading and writing bags and network messages_

[![npm version](https://img.shields.io/npm/v/@foxglove/rosmsg-serialization.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rosmsg-serialization)

## MessageReader

Message reader deserializes ROS messages into plain objects. The messages are fully deserialized.

```typescript
import { MessageReader } from "@foxglove/rosmsg-serialization";

// message definition comes from `parse()` in @foxglove/rosmsg
const reader = new MessageReader(messageDefinition);

// deserialize a buffer into an object
const message = reader.readMessage([0x00, 0x00, ...]);

// access message fields
message.header.stamp;
```

## LazyMessage

Lazy messages provide on-demand access and deserialization to fields of a serialized ROS message. Creating
a lazy message from a buffer performs no de-serialization during creation. Only accessed fields are
deserialized; the deserialization occurs at access time.

```Typescript
import { LazyMessageReader } from "@foxglove/rosmsg-serialization";

// message definition comes from `parse()` in @foxglove/rosmsg
const reader = new LazyMessageReader(messageDefinition);

// build a new lazy message instance for our serialized message from the Uint8Array
// Note: since deserialization is lazy - avoid-reusing the array you provide for other messages
const message = reader.readMessage([0x00, 0x00, ...]);

// access message fields
message.header.stamp;
```

## MessageWriter

Convert an object, array, or primitive value into binary data using ROS message serialization.

```Typescript
import { MessageWriter } from "@foxglove/rosmsg-serialization";

// message definition comes from `parse()` in @foxglove/rosmsg
const writer = new MessageWriter(pointStampedMessageDefinition);

// serialize the passed in object to a Uint8Array as a geometry_msgs/PointStamped message
const uint8Array = writer.writeMessage({
  header: {
    seq: 0,
    stamp: { sec: 0, nsec: 0 },
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

@foxglove/rosmsg-serialization is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Releasing

1. Run `yarn version --[major|minor|patch]` to bump version
2. Run `git push && git push --tags` to push new tag
3. GitHub Actions will take care of the rest

## Benchmarks

The `bench` folder contains benchmarks. Run with:

```
yarn bench
yarn bench:benny
```

To run benchmarks in web:

```
yarn bench:web
```

## Stay in touch

Join our [Slack channel](https://foxglove.dev/slack) to ask questions, share feedback, and stay up to date on what our team is working on.
