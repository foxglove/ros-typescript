import { ForwardIterator } from "./ForwardIterator";
import { consumeMessages, FakeBagReader, generateFixtures } from "./test_support/iterator";

describe("ForwardIterator", () => {
  it("should iterate empty bag", async () => {
    const iterator = new ForwardIterator({
      connections: new Map(),
      chunkInfos: [],
      decompress: {},
      reader: new FakeBagReader([]),
      position: { sec: 0, nsec: 0 },
    });

    const messages = await consumeMessages(iterator);
    expect(messages).toEqual([]);
  });

  it("should iterate through a chunk", async () => {
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 1,
            },
            {
              connection: 0,
              time: 0,
              value: 2,
            },
            {
              connection: 0,
              time: 1,
              value: 3,
            },
          ],
        },
      ],
    });

    const iterator = new ForwardIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 0 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages);
  });

  it("should ignore messages before position", async () => {
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 1,
            },
            {
              connection: 0,
              time: 1,
              value: 2,
            },
          ],
        },
      ],
    });

    const iterator = new ForwardIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 1 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages.filter((msg) => msg.timestamp.nsec >= 1));
  });

  it("should read multiple overlapping chunks", async () => {
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 1,
            },
            {
              connection: 0,
              time: 1,
              value: 2,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 3,
            },
            {
              connection: 0,
              time: 1,
              value: 4,
            },
          ],
        },
      ],
    });

    const iterator = new ForwardIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 0 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages);
  });

  // Test when the there is a chunk with messages before and after the position BUT
  // the messages we want are before our position in the chunk so we need the next chunk.
  //
  // [AABB][AABB]
  //     ^
  it("should iterate when messages are before position and after", async () => {
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 1,
            },
            {
              connection: 0,
              time: 1,
              value: 2,
            },
            {
              connection: 1,
              time: 2,
              value: 3,
            },
            {
              connection: 1,
              time: 3,
              value: 4,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 4,
              value: 5,
            },
          ],
        },
      ],
    });

    const iterator = new ForwardIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 3 },
      topics: ["/0"],
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages.filter((msg) => msg.timestamp.nsec >= 4));
  });

  it("should iterate over messages in overlapping and non-overlapping chunks", async () => {
    /* Chunk ordering (shown numbers are connection number, X-axis is time):
     *
     * 0 --------- 1 --------------- 0
     *       0 --------- 2 --------------- 0
     *             0 --------- 1 --------------- 0
     *                                                 0 --- 1 --- 0
     */
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 0,
              value: 1,
            },
            {
              connection: 1,
              time: 2,
              value: 1,
            },
            {
              connection: 0,
              time: 5,
              value: 1,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 1,
              value: 3,
            },
            {
              connection: 2,
              time: 3,
              value: 3,
            },
            {
              connection: 0,
              time: 6,
              value: 3,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 2,
              value: 5,
            },
            {
              connection: 1,
              time: 4,
              value: 5,
            },
            {
              connection: 0,
              time: 7,
              value: 5,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 8,
              value: 5,
            },
            {
              connection: 1,
              time: 9,
              value: 5,
            },
            {
              connection: 0,
              time: 10,
              value: 5,
            },
          ],
        },
      ],
    });

    const iterator = new ForwardIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 0 },
      topics: ["/1", "/2"],
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(
      expectedMessages.filter((msg) => ["/1", "/2"].includes(msg.topic)),
    );
  });
});
