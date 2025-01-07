import type { Time } from "@foxglove/rostime";
import Heap from "heap";

import { IBagReader } from "./IBagReader";
import { ChunkInfo, Connection, MessageData } from "./record";
import type {
  ChunkReadResult,
  Decompress,
  IteratorConstructorArgs,
  MessageEvent,
  MessageIterator,
} from "./types";

type HeapItem = { time: Time; offset: number; chunkReadResult: ChunkReadResult };

export abstract class BaseIterator implements MessageIterator {
  private connections: Map<number, Connection>;
  private parse?: IteratorConstructorArgs["parse"];

  protected connectionIds?: Set<number>;
  protected reader: IBagReader;
  protected heap: Heap<HeapItem>;
  protected position: Time;
  protected decompress: Decompress;
  protected chunkInfos: ChunkInfo[];
  protected cachedChunkReadResults = new Map<number, ChunkReadResult>();

  constructor(args: IteratorConstructorArgs, compare: (a: HeapItem, b: HeapItem) => number) {
    this.connections = args.connections;
    this.reader = args.reader;
    this.position = args.position;
    this.decompress = args.decompress;
    this.reader = args.reader;
    this.chunkInfos = args.chunkInfos;
    this.heap = new Heap(compare);
    this.parse = args.parse;

    // if we want to filter by topic, make a list of connection ids to allow
    if (args.topics) {
      const topics = args.topics;
      const connectionIds = (this.connectionIds = new Set());
      for (const [id, connection] of args.connections) {
        if (topics.includes(connection.topic)) {
          this.connectionIds.add(id);
        }
      }

      // When filtering to topics, limit the chunkInfos to the chunks containing
      // the topic. We can do this filter once during construction
      this.chunkInfos = args.chunkInfos.filter((info) => {
        return info.connections.find((conn) => {
          return connectionIds.has(conn.conn);
        });
      });
    }
  }

  /**
   * Load the next set of messages into the heap
   * @returns False if no more messages can be loaded, True otherwise.
   */
  protected abstract loadNext(): Promise<boolean>;

  /**
   * @returns An AsyncIterator of MessageEvents
   */
  async *[Symbol.asyncIterator](): AsyncIterator<MessageEvent> {
    while (true) {
      // Keep on reading chunks into the heap until no more chunk can be loaded (EOF)
      while (!this.heap.front()) {
        const chunkLoaded = await this.loadNext();
        if (!chunkLoaded) {
          return;
        }
      }

      const item = this.heap.pop();
      if (!item) {
        return;
      }

      const chunk = item.chunkReadResult.chunk;
      const messageData = this.reader.readRecordFromBuffer(
        chunk.data!.subarray(item.offset),
        chunk.dataOffset!,
        MessageData,
      );

      const connection = this.connections.get(messageData.conn);
      if (!connection) {
        throw new Error(`Unable to find connection with id ${messageData.conn}`);
      }

      const { topic } = connection;
      const { data, time } = messageData;
      if (!data) {
        throw new Error(`No data in message for topic: ${topic}`);
      }

      const event: MessageEvent = {
        topic,
        connectionId: messageData.conn,
        timestamp: time,
        data,
        message: this.parse?.(data, connection),
      };

      yield event;
    }
  }
}
