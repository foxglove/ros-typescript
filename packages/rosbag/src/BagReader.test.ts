// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import BagReader from "./BagReader";
import { BagHeader, Chunk, ChunkInfo, MessageData } from "./record";

function uint64Buffer(number: number) {
  const buff = Buffer.alloc(8);
  buff.writeBigUInt64LE(BigInt(number), 0);
  return buff;
}

function uint32Buffer(number: number) {
  const buff = Buffer.alloc(4);
  buff.writeUInt32LE(number, 0);
  return buff;
}

function makeHeaderKeyValuePairBuffer(key: string, value: Buffer) {
  const indexFieldName = Buffer.from(`${key}=`, "ascii");
  const combined = Buffer.concat([indexFieldName, value]);
  const lengthBuffer = uint32Buffer(combined.byteLength);
  return Buffer.concat([lengthBuffer, combined]);
}

function makeRecord(
  fields: [string, Buffer][],
  data: Buffer,
  {
    headerLength,
    dataLength = data.byteLength,
  }: { headerLength?: number; dataLength?: number } = {},
) {
  const header = Buffer.concat(
    fields.map(([key, value]) => makeHeaderKeyValuePairBuffer(key, value)),
  );
  return Buffer.concat([
    uint32Buffer(headerLength ?? header.byteLength),
    header,
    uint32Buffer(dataLength),
    data,
  ]);
}

const messageDataFields: [string, Buffer][] = [
  ["op", Buffer.from([MessageData.opcode])],
  ["conn", uint32Buffer(0)],
  ["time", uint64Buffer(0)],
];

// A bag holding only the preamble and header record, which throws on reads past the end of the
// file like the node FileReader.
class FakeHeaderFilelike {
  preamble = "#ROSBAG V2.0\n";
  headerLength?: number;
  indexPosition = 0;
  connectionCount = 0;
  chunkCount = 0;
  extraFields: [string, Buffer][] = [];
  // The header record's header and data are padded with spaces to this many bytes, as the ROS 1
  // writers do. Headers longer than this get no padding.
  paddedSize = 4096;

  private bytes() {
    const fields: [string, Buffer][] = [
      ["op", Buffer.from([BagHeader.opcode])],
      ["index_pos", uint64Buffer(this.indexPosition)],
      ["conn_count", uint32Buffer(this.connectionCount)],
      ["chunk_count", uint32Buffer(this.chunkCount)],
      ...this.extraFields,
    ];
    const headerSize = makeRecord(fields, Buffer.alloc(0)).byteLength - 8;
    // According to rosbag documentation,
    // header record is padded out by filling with ASCII space (0x20).
    const padding = Buffer.alloc(Math.max(0, this.paddedSize - headerSize), " ");
    return Buffer.concat([
      Buffer.from(this.preamble),
      makeRecord(fields, padding, { headerLength: this.headerLength }),
    ]);
  }

  size() {
    return this.bytes().byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const bytes = this.bytes();
    if (offset + length > bytes.byteLength) {
      throw new Error(`Attempted to read ${length} bytes at offset ${offset}`);
    }
    return bytes.subarray(offset, offset + length);
  }
}

describe("BagReader", () => {
  describe("parsing header", () => {
    it("calls back with an error if the header has an invalid preamble", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.preamble = "#ROSBAG V1.0\n";
      const reader = new BagReader(filelike);
      await expect(reader.readHeader()).rejects.toThrow(new Error("Cannot identify bag format."));
    });

    it("parses header correctly with small values", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.indexPosition = 1;
      filelike.connectionCount = 2;
      filelike.chunkCount = 3;
      const reader = new BagReader(filelike);

      const header = await reader.readHeader();
      expect(header.indexPosition).toEqual(1);
      expect(header.connectionCount).toEqual(2);
      expect(header.chunkCount).toEqual(3);
    });

    it("parses header correctly with large values", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.indexPosition = 2 ** 32 + 1;
      filelike.connectionCount = 0x80000000;
      filelike.chunkCount = 0xffffffff;
      const reader = new BagReader(filelike);
      const header = await reader.readHeader();
      expect(header.indexPosition).toEqual(2 ** 32 + 1);
      expect(header.connectionCount).toEqual(0x80000000);
      expect(header.chunkCount).toEqual(0xffffffff);
    });

    it("parses an unpadded header record longer than the readahead", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.chunkCount = 3;
      filelike.extraFields = [["extra", Buffer.alloc(5000, "x")]];
      const reader = new BagReader(filelike);
      const header = await reader.readHeader();
      expect(header.chunkCount).toEqual(3);
      expect(header.length).toBeGreaterThan(5000);
    });

    it("parses a padded header record longer than the readahead", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.chunkCount = 3;
      filelike.extraFields = [["extra", Buffer.alloc(5000, "x")]];
      filelike.paddedSize = 6000;
      const reader = new BagReader(filelike);
      const header = await reader.readHeader();
      expect(header.chunkCount).toEqual(3);
      expect(header.length).toEqual(6008);
    });

    it("does not read past the end of a file that ends after a 4096-byte header record", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.chunkCount = 3;
      filelike.paddedSize = 4088;
      const reader = new BagReader(filelike);
      const header = await reader.readHeader();
      expect(header.chunkCount).toEqual(3);
      expect(header.length).toEqual(4096);
    });

    it("rejects a header length larger than the read buffer", async () => {
      const filelike = new FakeHeaderFilelike();
      filelike.headerLength = 0xffffffff;
      const reader = new BagReader(filelike);
      await expect(reader.readHeader()).rejects.toThrow(
        `Record at position 13 header too large: 4294967295.`,
      );
    });
  });

  describe("reading records", () => {
    it.each([8, 0x80000000, 0xffffffff])(
      "rejects record data length %i that exceeds the buffer",
      (dataLength) => {
        const record = makeRecord(messageDataFields, Buffer.from([1, 2, 3, 4]), { dataLength });
        // Bytes after the record's view belong to someone else and must not be read as its data.
        const backing = Uint8Array.from([...record, 0xde, 0xad, 0xbe, 0xef]);
        const reader = new BagReader(new FakeHeaderFilelike());

        expect(() =>
          reader.readRecordFromBuffer(backing.subarray(0, record.byteLength), 0, MessageData),
        ).toThrow(`Record at position 0 data too large: ${dataLength}.`);
      },
    );

    it.each([0x80000000, 0xffffffff])(
      "rejects record header length %i that exceeds the buffer",
      (headerLength) => {
        const record = makeRecord(messageDataFields, Buffer.from([1, 2, 3, 4]), { headerLength });
        const reader = new BagReader(new FakeHeaderFilelike());

        expect(() => reader.readRecordFromBuffer(record, 0, MessageData)).toThrow(
          `Record at position 0 header too large: ${headerLength}.`,
        );
      },
    );

    it.each(["constructor", "toString", "valueOf"])(
      "rejects compression type '%s' inherited from the decompress map",
      async (compression) => {
        const record = makeRecord(
          [
            ["op", Buffer.from([Chunk.opcode])],
            ["compression", Buffer.from(compression)],
            ["size", uint32Buffer(4)],
          ],
          Buffer.from([1, 2, 3, 4]),
        );
        const reader = new BagReader({ size: () => record.byteLength, read: async () => record });
        const chunkInfo = { chunkPosition: 0, count: 0 } as ChunkInfo;

        await expect(reader.readChunk(chunkInfo, {})).rejects.toThrow(
          `Unsupported compression type ${compression}`,
        );
      },
    );
  });
});
