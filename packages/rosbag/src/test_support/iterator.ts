import { IBagReader } from "../IBagReader";
import { ChunkInfo, Connection, IndexData, Record } from "../record";
import { ChunkReadResult, Constructor, MessageEvent, MessageIterator } from "../types";

export type EnhancedChunkInfo = ChunkInfo & {
  messages: FixtureMessage[];
};

export type FixtureMessage = {
  connection: number;
  time: number;
  value: number;
};

export type FixtureInput = {
  chunks: {
    messages: FixtureMessage[];
  }[];
};

export type FixtureOutput = {
  connections: Map<number, Connection>;
  chunkInfos: ChunkInfo[];
  reader: IBagReader;
  expectedMessages: MessageEvent[];
};

export class FakeBagReader implements IBagReader {
  private chunks: EnhancedChunkInfo[];

  constructor(chunks: EnhancedChunkInfo[]) {
    this.chunks = chunks;
  }

  async readChunk(chunkInfo: ChunkInfo): Promise<ChunkReadResult> {
    const chunk = this.chunks[chunkInfo.chunkPosition];
    if (!chunk) {
      throw new Error(`No chunk for position ${chunkInfo.chunkPosition}`);
    }

    const indexByConnId = new Map<number, IndexData>();

    const offsets = [];
    let offset = 0;
    for (const msg of chunk.messages) {
      let indexData = indexByConnId.get(msg.connection);
      if (!indexData) {
        indexData = {
          ver: 1,
          conn: msg.connection,
          count: 1,
          indices: [],
          parseData: () => {},
        };
        indexByConnId.set(msg.connection, indexData);
      }

      indexData.indices?.push({
        time: {
          sec: 0,
          nsec: msg.time,
        },
        offset,
      });

      offsets.push(offset);
      offset += 1;
    }

    return {
      chunk: {
        compression: "",
        size: chunk.messages.length,
        data: new Uint8Array(offsets),
        dataOffset: chunkInfo.chunkPosition,
        parseData: () => {},
      },
      indices: Array.from(indexByConnId.values()),
    };
  }

  readRecordFromBuffer<T extends Record>(
    buffer: Uint8Array,
    fileOffset: number,
    cls: Constructor<T> & { opcode: number },
  ): T {
    const chunk = this.chunks[fileOffset]!;
    const message = chunk.messages[buffer[0]!]!;

    const out = new cls({
      conn: new Uint8Array([message.connection, 0, 0, 0]),
      time: new Uint8Array([0, 0, 0, 0, message.time, 0, 0, 0]),
    });

    out.parseData(new Uint8Array([message.value]));
    return out;
  }
}

export function generateFixtures(input: FixtureInput): FixtureOutput {
  const connections: FixtureOutput["connections"] = new Map();
  const chunkInfos: EnhancedChunkInfo[] = [];
  const expectedMessages: MessageEvent[] = [];

  const connCounts = new Map<number, { conn: number; count: number }>();

  for (const chunk of input.chunks) {
    let startNs = Infinity;
    let endNs = 0;
    for (const msg of chunk.messages) {
      startNs = Math.min(msg.time, startNs);
      endNs = Math.max(msg.time, endNs);

      const connId = msg.connection;
      const topic = `/${connId}`;
      connections.set(connId, {
        conn: connId,
        topic,
        messageDefinition: `${connId}`,
        parseData: () => {},
      });

      const existingEntry = connCounts.get(connId) ?? {
        conn: connId,
        count: 0,
      };
      connCounts.set(connId, {
        conn: connId,
        count: existingEntry.count + 1,
      });

      expectedMessages.push({
        topic,
        timestamp: { sec: 0, nsec: msg.time },
        data: new Uint8Array([msg.value]),
        connectionId: connId,
      });
    }

    const idx = chunkInfos.length;
    chunkInfos.push({
      ver: 1,
      chunkPosition: idx,
      startTime: { sec: 0, nsec: startNs },
      endTime: { sec: 0, nsec: endNs },
      count: 1,
      connections: Array.from(connCounts.values()),
      parseData: () => {},
      messages: chunk.messages,
    });
  }

  expectedMessages.sort((a, b) => a.timestamp.nsec - b.timestamp.nsec);

  const reader = new FakeBagReader(chunkInfos);
  return {
    connections,
    chunkInfos,
    reader,
    expectedMessages,
  };
}

export async function consumeMessages(iterator: MessageIterator): Promise<MessageEvent[]> {
  const data = [];
  for await (const msg of iterator) {
    data.push(msg);
  }
  return data;
}
