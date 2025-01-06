// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { MessageReader } from "@foxglove/rosmsg-serialization";
import { Time } from "@foxglove/rostime";

import { extractFields, extractTime } from "./fields";

function readUint32(buff: Uint8Array): number {
  const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
  return view.getUint32(0, true);
}

function readInt32(buff: Uint8Array): number {
  const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
  return view.getInt32(0, true);
}

function readBigUInt64(buff: Uint8Array): number {
  const view = new DataView(buff.buffer, buff.byteOffset, buff.byteLength);
  // Avoid using DataView.getBigUint64 for improved browser compatibility
  const bigint = BigInt(view.getUint32(0, true)) | (BigInt(view.getUint32(4, true)) << 32n);
  if (bigint > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Read a bigint larger than 2**53: ${bigint}`);
  }
  return Number(bigint);
}

export class Record {
  offset?: number;
  dataOffset?: number;
  end?: number;
  length?: number;

  parseData(_buffer: Uint8Array): void {
    /* no-op */
  }
}

export class BagHeader extends Record {
  static opcode = 3;
  indexPosition: number;
  connectionCount: number;
  chunkCount: number;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.indexPosition = readBigUInt64(fields.index_pos!);
    this.connectionCount = readInt32(fields.conn_count!);
    this.chunkCount = readInt32(fields.chunk_count!);
  }
}

export class Chunk extends Record {
  static opcode = 5;
  compression: string;
  size: number;
  data?: Uint8Array;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.compression = new TextDecoder().decode(fields.compression);
    this.size = readUint32(fields.size!);
  }

  override parseData(buffer: Uint8Array): void {
    this.data = buffer;
  }
}

const getField = (
  fields: {
    [key: string]: Uint8Array;
  },
  key: string,
) => {
  if (fields[key] == undefined) {
    throw new Error(`Connection header is missing ${key}.`);
  }
  return new TextDecoder().decode(fields[key]);
};

export class Connection extends Record {
  static opcode = 7;
  conn: number;
  topic: string;
  type?: string;
  md5sum?: string;
  messageDefinition: string;
  callerid?: string;
  latching?: boolean;
  reader?: MessageReader;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.conn = readUint32(fields.conn!);
    this.topic = new TextDecoder().decode(fields.topic);
    this.type = undefined;
    this.md5sum = undefined;
    this.messageDefinition = "";
  }

  override parseData(buffer: Uint8Array): void {
    const fields = extractFields(buffer);
    this.type = getField(fields, "type");
    this.md5sum = getField(fields, "md5sum");
    this.messageDefinition = getField(fields, "message_definition");
    if (fields.callerid != undefined) {
      this.callerid = new TextDecoder().decode(fields.callerid);
    }
    if (fields.latching != undefined) {
      this.latching = new TextDecoder().decode(fields.latching) === "1";
    }
  }
}

export class MessageData extends Record {
  static opcode = 2;
  conn: number;
  time: Time;
  data?: Uint8Array;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.conn = readUint32(fields.conn!);
    this.time = extractTime(fields.time!, 0);
  }

  override parseData(buffer: Uint8Array): void {
    this.data = buffer;
  }
}

export class IndexData extends Record {
  static opcode = 4;
  ver: number;
  conn: number;
  count: number;
  indices?: Array<{ time: Time; offset: number }>;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.ver = readUint32(fields.ver!);
    this.conn = readUint32(fields.conn!);
    this.count = readUint32(fields.count!);
  }

  override parseData(buffer: Uint8Array): void {
    this.indices = [];

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    for (let i = 0; i < this.count; i++) {
      this.indices.push({
        time: extractTime(buffer, i * 12),
        offset: view.getUint32(i * 12 + 8, true),
      });
    }
  }
}

export class ChunkInfo extends Record {
  static opcode = 6;
  ver: number;
  chunkPosition: number;
  startTime: Time;
  endTime: Time;
  count: number;
  connections: Array<{ conn: number; count: number }> = [];
  nextChunk?: ChunkInfo;

  constructor(fields: { [key: string]: Uint8Array }) {
    super();
    this.ver = readUint32(fields.ver!);
    this.chunkPosition = readBigUInt64(fields.chunk_pos!);
    this.startTime = extractTime(fields.start_time!, 0);
    this.endTime = extractTime(fields.end_time!, 0);
    this.count = readUint32(fields.count!);
  }

  override parseData(buffer: Uint8Array): void {
    this.connections = [];
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    for (let i = 0; i < this.count; i++) {
      this.connections.push({
        conn: view.getUint32(i * 8, true),
        count: view.getUint32(i * 8 + 4, true),
      });
    }
  }
}
