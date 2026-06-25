// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import type { MessageDefinition } from "@foxglove/message-definition";
import { parse as parseMessageDefinition } from "@foxglove/rosmsg";

import { MessageReader } from "./MessageReader";
import messageReaderTests from "./fixtures/messageReaderTests";

const getStringBuffer = (str: string) => {
  const data = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.byteLength, 0);
  return Uint8Array.from([...len, ...data]);
};

describe("MessageReader", () => {
  it("rejects invalid ROS field names before generating readers", () => {
    const globalWithMarker = globalThis as typeof globalThis & {
      rosmsgSerializationReaderInjected?: boolean;
    };
    delete globalWithMarker.rosmsgSerializationReaderInjected;
    const payloadName = "x; globalThis.rosmsgSerializationReaderInjected = true; this.y";
    const definitions: MessageDefinition[] = [
      {
        name: "std_msgs/String",
        definitions: [
          {
            name: payloadName,
            type: "string",
            isArray: false,
            isComplex: false,
            isConstant: false,
          },
        ],
      },
    ];

    expect(() => new MessageReader(definitions)).toThrow(/valid ROS field name/);
    expect(globalWithMarker.rosmsgSerializationReaderInjected).toBeUndefined();
  });

  it("allows reserved words as field names", () => {
    const reader = new MessageReader(parseMessageDefinition("uint8 function"));

    expect(reader.readMessage(Uint8Array.from([3]))).toEqual({ function: 3 });
  });

  it.each(messageReaderTests)(
    "should deserialize %s",
    (msgDef: string, arr: Iterable<number>, expected: Record<string, unknown>) => {
      const buffer = Uint8Array.from(arr);
      const reader = new MessageReader(parseMessageDefinition(msgDef));

      // read aligned array
      {
        const read = reader.readMessage(buffer);
        expect(read).toEqual(expected);
      }

      // read offset array
      {
        const offset = 4;
        const fullArr = new Uint8Array(buffer.length + offset);
        fullArr.set(buffer, offset);

        const read = reader.readMessage(
          new Uint8Array(fullArr.buffer, fullArr.byteOffset + offset, fullArr.byteLength - offset),
        );
        expect(read).toEqual(expected);
      }
    },
  );

  it("freezes the resulting message if requested", () => {
    // strict mode is required for Object.freeze to throw
    "use strict";

    const reader = new MessageReader(
      parseMessageDefinition("string firstName \n string lastName\nuint16 age"),
      {
        freeze: true,
      },
    );
    const buffer = Buffer.concat([
      getStringBuffer("foo"),
      getStringBuffer("bar"),
      new Uint8Array([0x05, 0x00]),
    ]);
    const output = reader.readMessage<{ firstName: string; lastName: string }>(buffer);
    expect(output).toEqual({ firstName: "foo", lastName: "bar", age: 5 });
    expect(() => {
      output.firstName = "boooo";
    }).toThrow();
  });

  describe("lastReadHadTrailingBytes", () => {
    const msgDef = `string firstName\nstring lastName\nuint16 age`;
    const exactPayload = Buffer.concat([
      getStringBuffer("foo"),
      getStringBuffer("bar"),
      new Uint8Array([0x05, 0x00]),
    ]);

    it("reports zero trailing bytes for an exact-fit decode", () => {
      const reader = new MessageReader(parseMessageDefinition(msgDef));

      const result = reader.readMessage(exactPayload);

      expect(result).toEqual({ firstName: "foo", lastName: "bar", age: 5 });
      expect(reader.lastReadByteLength()).toBe(exactPayload.byteLength);
      expect(reader.lastReadHadTrailingBytes()).toBe(false);
    });

    it("flags trailing bytes when the payload is larger than the schema consumes", () => {
      const reader = new MessageReader(parseMessageDefinition(msgDef));
      const trailing = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const buffer = Buffer.concat([exactPayload, trailing]);

      expect(reader.readMessage(buffer)).toEqual({ firstName: "foo", lastName: "bar", age: 5 });
      expect(reader.lastReadByteLength()).toBe(exactPayload.byteLength);
      expect(reader.lastReadHadTrailingBytes()).toBe(true);
    });

    it("clears trailing byte state after the next exact-fit decode", () => {
      const reader = new MessageReader(parseMessageDefinition(msgDef));
      const trailing = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const buffer = Buffer.concat([exactPayload, trailing]);

      reader.readMessage(buffer);
      expect(reader.lastReadByteLength()).toBe(exactPayload.byteLength);
      expect(reader.lastReadHadTrailingBytes()).toBe(true);

      reader.readMessage(exactPayload);
      expect(reader.lastReadByteLength()).toBe(exactPayload.byteLength);
      expect(reader.lastReadHadTrailingBytes()).toBe(false);
    });
  });
});
