// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { compare, isGreaterThan, Time } from "@foxglove/rostime";

import { extractFields } from "./fields";
import nmerge from "./nmerge";
import { Record, BagHeader, Chunk, ChunkInfo, Connection, IndexData, MessageData } from "./record";
import type { Filelike, Constructor, Decompress, ChunkReadResult } from "./types";

// Use little endian to read values in dataview
const LITTLE_ENDIAN = true;

const HEADER_READAHEAD = 4096;
const HEADER_OFFSET = 13;

// BagReader is a lower level interface for reading specific sections & chunks
// from a rosbag file - generally it is consumed through the Bag class, but
// can be useful to use directly for efficiently accessing raw pieces from
// within the bag
export default class BagReader {
  private _lastReadResult?: ChunkReadResult;
  private _file: Filelike;
  private _lastChunkInfo?: ChunkInfo;

  constructor(filelike: Filelike) {
    this._file = filelike;
  }

  async verifyBagHeader(): Promise<void> {
    const buffer = await this._file.read(0, HEADER_OFFSET);
    const magic = new TextDecoder().decode(buffer);
    if (magic !== "#ROSBAG V2.0\n") {
      throw new Error("Cannot identify bag format.");
    }
  }

  // reads the header block from the rosbag file
  // generally you call this first
  // because you need the header information to call readConnectionsAndChunkInfo
  async readHeader(): Promise<BagHeader> {
    await this.verifyBagHeader();
    const buffer = await this._file.read(HEADER_OFFSET, HEADER_READAHEAD);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const read = buffer.length;
    if (read < 8) {
      throw new Error(`Record at position ${HEADER_OFFSET} is truncated.`);
    }

    const headerLength = view.getInt32(0, LITTLE_ENDIAN);
    if (read < headerLength + 8) {
      throw new Error(`Record at position ${HEADER_OFFSET} header too large: ${headerLength}.`);
    }
    return this.readRecordFromBuffer(buffer, HEADER_OFFSET, BagHeader);
  }

  // reads connection and chunk information from the bag
  // you'll generally call this after reading the header so you can get
  // connection metadata and chunkInfos which allow you to seek to individual
  // chunks & read them
  async readConnectionsAndChunkInfo(
    fileOffset: number,
    connectionCount: number,
    chunkCount: number,
  ): Promise<{ connections: Connection[]; chunkInfos: ChunkInfo[] }> {
    const buffer = await this._file.read(fileOffset, this._file.size() - fileOffset);

    if (connectionCount === 0) {
      return { connections: [], chunkInfos: [] };
    }

    const connections = this.readRecordsFromBuffer(buffer, connectionCount, fileOffset, Connection);
    const connectionBlockLength = connections[connectionCount - 1]!.end! - connections[0]!.offset!;
    const chunkInfos = this.readRecordsFromBuffer(
      buffer.subarray(connectionBlockLength),
      chunkCount,
      fileOffset + connectionBlockLength,
      ChunkInfo,
    );

    if (chunkCount > 0) {
      for (let i = 0; i < chunkCount - 1; i++) {
        chunkInfos[i]!.nextChunk = chunkInfos[i + 1];
      }
      chunkInfos[chunkCount - 1]!.nextChunk = undefined;
    }

    return { connections, chunkInfos };
  }

  // read individual raw messages from the bag at a given chunk
  // filters to a specific set of connection ids, start time, & end time
  // generally the records will be of type MessageData
  async readChunkMessages(
    chunkInfo: ChunkInfo,
    connections: number[],
    startTime: Time,
    endTime: Time,
    decompress: Decompress,
  ): Promise<MessageData[]> {
    const start = startTime ?? { sec: 0, nsec: 0 };
    const end = endTime ?? { sec: Number.MAX_VALUE, nsec: Number.MAX_VALUE };
    const conns =
      connections ??
      chunkInfo.connections.map((connection) => {
        return connection.conn;
      });

    const result = await this.readChunk(chunkInfo, decompress);

    const chunk = result.chunk;
    const indices: {
      [conn: number]: IndexData;
    } = {};
    result.indices.forEach((index) => {
      indices[index.conn] = index;
    });
    const presentConnections = conns.filter((conn) => {
      return indices[conn] != undefined;
    });
    const iterables = presentConnections.map((conn) => {
      return indices[conn]!.indices![Symbol.iterator]();
    });
    const iter = nmerge((a, b) => compare(a.time, b.time), ...iterables);

    const entries = [];
    let item = iter.next();
    while (item.done !== true) {
      const { value } = item;
      item = iter.next();
      if (value == null || isGreaterThan(start, value.time)) {
        continue;
      }
      if (isGreaterThan(value.time, end)) {
        break;
      }
      entries.push(value);
    }

    const messages = entries.map((entry) => {
      return this.readRecordFromBuffer(
        chunk.data!.subarray(entry.offset),
        chunk.dataOffset!,
        MessageData,
      );
    });

    return messages;
  }

  // reads a single chunk record && its index records given a chunkInfo
  async readChunk(chunkInfo: ChunkInfo, decompress: Decompress): Promise<ChunkReadResult> {
    // if we're reading the same chunk a second time return the cached version
    // to avoid doing decompression on the same chunk multiple times which is
    // expensive
    if (chunkInfo === this._lastChunkInfo && this._lastReadResult != null) {
      return this._lastReadResult;
    }
    const { nextChunk } = chunkInfo;

    const readLength =
      nextChunk != null
        ? nextChunk.chunkPosition - chunkInfo.chunkPosition
        : this._file.size() - chunkInfo.chunkPosition;

    const buffer = await this._file.read(chunkInfo.chunkPosition, readLength);

    const chunk = this.readRecordFromBuffer(buffer, chunkInfo.chunkPosition, Chunk);
    const { compression } = chunk;
    if (compression !== "none") {
      const decompressFn = decompress[compression];
      if (decompressFn == null) {
        throw new Error(`Unsupported compression type ${chunk.compression}`);
      }
      const result = decompressFn(chunk.data!, chunk.size);
      chunk.data = result;
    }
    const indices = this.readRecordsFromBuffer(
      buffer.subarray(chunk.length),
      chunkInfo.count,
      chunkInfo.chunkPosition + chunk.length!,
      IndexData,
    );

    this._lastChunkInfo = chunkInfo;
    this._lastReadResult = { chunk, indices };
    return this._lastReadResult;
  }

  // reads count records from a buffer starting at fileOffset
  readRecordsFromBuffer<T extends Record>(
    buffer: Uint8Array,
    count: number,
    fileOffset: number,
    cls: Constructor<T> & { opcode: number },
  ): T[] {
    const records = [];
    let bufferOffset = 0;
    for (let i = 0; i < count; i++) {
      const record = this.readRecordFromBuffer(
        buffer.subarray(bufferOffset),
        fileOffset + bufferOffset,
        cls,
      );
      // We know that .end and .offset are set by readRecordFromBuffer
      // A future enhancement is to remove the non-null assertion
      // Maybe record doesn't need to store these internall and we can return that from readRecordFromBuffer?
      // Maybe record should be an interface where these are required and the actual record is inside it?
      bufferOffset += record.end! - record.offset!;
      records.push(record);
    }
    return records;
  }

  // read an individual record from a buffer
  readRecordFromBuffer<T extends Record>(
    buffer: Uint8Array,
    fileOffset: number,
    cls: Constructor<T> & { opcode: number },
  ): T {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const headerLength = view.getInt32(0, LITTLE_ENDIAN);

    const fields = extractFields(buffer.subarray(4, 4 + headerLength));
    if (fields.op == undefined) {
      throw new Error("Record is missing 'op' field.");
    }

    const opView = new DataView(fields.op.buffer, fields.op.byteOffset, fields.op.byteLength);
    const opcode = opView.getUint8(0);
    if (opcode !== cls.opcode) {
      throw new Error(`Expected ${cls.name} (${cls.opcode}) but found ${opcode}`);
    }
    const record = new cls(fields);

    const dataOffset = 4 + headerLength + 4;
    const dataLength = view.getInt32(4 + headerLength, LITTLE_ENDIAN);

    // Take a data slice of the underlying array buffer so we don't hold on to the rest of the chunk
    // when we store `data` on the record (happens in parseData)
    //
    // Note: using slice on the Uint8Array does not slice the underlying array buffer and can result
    // in the `data` still having a reference to the entire underlying array buffer which we do not
    // want.
    const data = new Uint8Array(
      buffer.buffer.slice(
        buffer.byteOffset + dataOffset,
        buffer.byteOffset + dataOffset + dataLength,
      ),
    );

    record.parseData(data);

    record.offset = fileOffset;
    record.dataOffset = record.offset + 4 + headerLength + 4;
    record.end = record.dataOffset + dataLength;
    record.length = record.end - record.offset;

    return record;
  }
}
