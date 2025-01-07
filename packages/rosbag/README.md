# @foxglove/rosbag &nbsp; [![npm version](https://img.shields.io/npm/v/@foxglove/rosbag.svg?style=flat)](https://www.npmjs.com/package/@foxglove/rosbag)

`@foxglove/rosbag` is a node.js & browser compatible module for reading [rosbag](http://wiki.ros.org/rosbag) binary data files.

## Installation

```
npm install @foxglove/rosbag
```

or

```
yarn add @foxglove/rosbag
```

## Quick start

The most common way to interact with a rosbag is to read data records for a specific set of topics. The rosbag format [encodes type information for topics](http://wiki.ros.org/msg), and `rosbag` reads this type information and parses the data records into JavaScript objects and arrays.

Here is an example of reading messages from a rosbag in node.js:

```typescript
import { Bag } from "@foxglove/rosbag";
import { FileReader } from "@foxglove/rosbag/node";

async function logMessagesFromFooBar() {
  // open a new bag with a speific file reader
  const bag = new Bag(new FileReader("../path/to/ros.bag"));

  await bag.open();

  for await (const result of bag.messageIterator({ topics: ["/foo", "/bar"] })) {
    // topic is the topic the data record was in
    // in this case it will be either '/foo' or '/bar'
    console.log(result.topic);

    // message is the parsed payload
    // this payload will likely differ based on the topic
    console.log(result.message);
  }
}

logMessagesFromFooBar();
```

## API

### Bag instance

```typescript
class Bag {
  // the time of the earliest message in the bag
  startTime: Time,

  // the time of the last message in the bag
  endTime: Time,

  // a hash of connection records by their id
  connections: { [number]: Connection },

  // an array of ChunkInfos describing the chunks within the bag
  chunkInfos: Array<ChunkInfo>,
}
```

### BagOptions

```typescript
const options = {
  // decompression callbacks:
  // if your bag is compressed you can supply a callback to decompress it
  // based on the compression type. The callback should accept a buffer of compressed bytes
  // and return a buffer of uncompressed bytes.  For examples on how to decompress lz4 and bz2 compressed bags
  // please see the tests here: https://github.com/cruise-automation/rosbag.js/blob/545529344c8c2a0b3a3126646d065043c2d67d84/src/bag.test.js#L167-L192
  // The decompression callback is also passed the uncompressedByteLength which is stored in the bag.
  // This byte length can be used with some decompression libraries to increase decompression efficiency.
  decompress?: {
    bz2?: (buffer: Uint8Array, uncompressedByteLength: number) => Uint8Array,
    lz4?: (buffer: Uint8Array, uncompressedByteLength: number) => Uint8Array,
  },

  // Toggle the message deserialization behavior. By default, messages are deserialized into javascript objects. You can override this behavior by setting this to `false`.
  parse?: boolean;
}
```

### Consuming messages from the bag instance

`bag.messageIterator` method returns an [Async Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncIterator) for messages in the file. Each item is a `MessageEvent`.

### IteratorOptions

```typescript
const options {
  // an optional array of topics used to filter down
  // which data records will be read
  // the default is all records on all topics
  topics?: Array<string>,

  // an optional Time instance used to filter data records
  // to only those which start on or after the given start time
  // the default is undefined which will apply no filter
  start?: Time,
}
```

### MessageEvent

```typescript
const messageEvent {
  // the topic from which the current record was read
  topic: string,

  // the receive time of the message
  timestamp: Time

  // the raw buffer data from the data record
  // a node.js buffer in node & an array buffer in the browser
  data: Uint8Array,

  // the parsed message contents as a JavaScript object
  // this can contain nested complex types
  // and arrays of complex & simple types
  // If parsing is disabled this field is set to `undefined`
  message?: { [string]: unknown },
}
```

### Connection

```typescript
class Connection {
  // the id of the connection
  conn: number,

  // the topic for the connection
  topic: string,

  // the md5 hash for the connection message definition
  md5sum: string,

  // the rosbag formatted message definition for records on this connection's topic
  messageDefinition: string,
}
```

## Stay in touch

Join our [Slack channel](https://foxglove.dev/slack) to ask questions, share feedback, and stay up to date on what our team is working on.
