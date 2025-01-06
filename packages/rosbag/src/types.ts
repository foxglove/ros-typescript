// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import type { Time } from "@foxglove/rostime";

import type { IBagReader } from "./IBagReader";
import type { Chunk, ChunkInfo, Connection, IndexData } from "./record";

export type RawFields = { [k: string]: Uint8Array };

export interface Constructor<T> {
  new (fields: RawFields): T;
}

export interface Filelike {
  read(offset: number, length: number): Promise<Uint8Array>;
  size(): number;
}

export type Decompress = {
  [compression: string]: (buffer: Uint8Array, size: number) => Uint8Array;
};

export type ChunkReadResult = {
  chunk: Chunk;
  indices: IndexData[];
};

export type IteratorConstructorArgs = {
  position: Time;
  connections: Map<number, Connection>;
  chunkInfos: ChunkInfo[];
  reader: IBagReader;
  decompress: Decompress;

  topics?: string[];
  parse?: (data: Uint8Array, connection: Connection) => unknown;
};

export type MessageEvent = {
  topic: string;
  timestamp: Time;
  data: Uint8Array;
  connectionId: number;

  message?: unknown;
};

export type MessageIterator = {
  /**
   * @returns An AsyncIterator for serialized message data from the forward iterator
   */
  [Symbol.asyncIterator](): AsyncIterator<MessageEvent>;
};
