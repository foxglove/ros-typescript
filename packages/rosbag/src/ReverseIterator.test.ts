import { ReverseIterator } from "./ReverseIterator";
import { consumeMessages, FakeBagReader, generateFixtures } from "./test_support/iterator";

describe("ReverseIterator", () => {
  it("should iterate empty bag", async () => {
    const iterator = new ReverseIterator({
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

    const iterator = new ReverseIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 1 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages.reverse());
  });

  it("should ignore messages after position", async () => {
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

    const iterator = new ReverseIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 0 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(
      expectedMessages.reverse().filter((msg) => msg.timestamp.nsec <= 0),
    );
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

    const iterator = new ReverseIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 1 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(
      expectedMessages.sort((a, b) => b.timestamp.nsec - a.timestamp.nsec),
    );
  });

  it("should include chunks which are within other chunk ranges", async () => {
    const { connections, chunkInfos, reader, expectedMessages } = generateFixtures({
      chunks: [
        {
          messages: [
            {
              connection: 0,
              time: 2,
              value: 1,
            },
            {
              connection: 0,
              time: 10,
              value: 2,
            },
          ],
        },
        {
          messages: [
            {
              connection: 0,
              time: 3,
              value: 3,
            },
            {
              connection: 0,
              time: 5,
              value: 4,
            },
          ],
        },
      ],
    });

    const iterator = new ReverseIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 12 },
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(expectedMessages.reverse());
  });

  // Test when the there is a chunk with messages before and after the position BUT
  // the messages we want are after our position in the chunk so we need the previous chunk.
  //
  // [AABB][AABB]
  //        ^
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
            {
              connection: 0,
              time: 5,
              value: 6,
            },
            {
              connection: 1,
              time: 6,
              value: 7,
            },
            {
              connection: 1,
              time: 7,
              value: 8,
            },
          ],
        },
      ],
    });

    const iterator = new ReverseIterator({
      connections,
      chunkInfos,
      decompress: {},
      reader,
      position: { sec: 0, nsec: 5 },
      topics: ["/1"],
    });

    const actualMessages = await consumeMessages(iterator);
    expect(actualMessages).toEqual(
      expectedMessages.reverse().filter((msg) => msg.timestamp.nsec <= 5 && msg.connectionId === 1),
    );
  });
});
