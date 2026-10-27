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

// rosbag writers pad the header record's data to 4096 bytes minus the header length, so the full
// record (including both 4-byte length prefixes) is usually 4104 bytes, although it can be longer.
const HEADER_READAHEAD = 4104;
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
    const fileSize = this._file.size();
    let buffer = await this._file.read(
      HEADER_OFFSET,
      Math.min(HEADER_READAHEAD, fileSize - HEADER_OFFSET),
    );
    // Header fields longer than the readahead need a re-read. The record's data is only padding,
    // so it is never read.
    if (buffer.byteLength >= 4) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const dataOffset = 4 + view.getUint32(0, LITTLE_ENDIAN) + 4;
      if (dataOffset > buffer.byteLength && HEADER_OFFSET + dataOffset <= fileSize) {
        buffer = await this._file.read(HEADER_OFFSET, dataOffset);
      }
    }
    const { record, dataLength } = this.readRecordHeaderFromBuffer(
      buffer,
      HEADER_OFFSET,
      BagHeader,
    );
    if (record.end! > fileSize) {
      throw new Error(`Record at position ${HEADER_OFFSET} data too large: ${dataLength}.`);
    }
    return record;
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const start = startTime ?? { sec: 0, nsec: 0 };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const end = endTime ?? { sec: Number.MAX_VALUE, nsec: Number.MAX_VALUE };
    const conns =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      const decompressFn = Object.prototype.hasOwnProperty.call(decompress, compression)
        ? decompress[compression]
        : undefined;
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
    const { record, dataOffset, dataLength } = this.readRecordHeaderFromBuffer(
      buffer,
      fileOffset,
      cls,
    );
    if (buffer.byteLength < dataOffset + dataLength) {
      throw new Error(`Record at position ${fileOffset} data too large: ${dataLength}.`);
    }

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

    return record;
  }

  // Reads a record's header and data length without reading its data, which buffer need not hold.
  private readRecordHeaderFromBuffer<T extends Record>(
    buffer: Uint8Array,
    fileOffset: number,
    cls: Constructor<T> & { opcode: number },
  ): { record: T; dataOffset: number; dataLength: number } {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    if (buffer.byteLength < 8) {
      throw new Error(`Record at position ${fileOffset} is truncated.`);
    }

    const headerLength = view.getUint32(0, LITTLE_ENDIAN);
    const dataOffset = 4 + headerLength + 4;
    if (buffer.byteLength < dataOffset) {
      throw new Error(`Record at position ${fileOffset} header too large: ${headerLength}.`);
    }

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

    const dataLength = view.getUint32(4 + headerLength, LITTLE_ENDIAN);

    record.offset = fileOffset;
    record.dataOffset = record.offset + dataOffset;
    record.end = record.dataOffset + dataLength;
    record.length = record.end - record.offset;

    return { record, dataOffset, dataLength };
  }
}
