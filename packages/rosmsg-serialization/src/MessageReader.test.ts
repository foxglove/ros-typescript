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
  it.each(["prototype", "constructor", "class", "let", "eval", "arguments", "Type0"])(
    "reads a complex type named %s without using it as an identifier",
    (name) => {
      const definitions: MessageDefinition[] = [
        { definitions: [{ name: "value", type: name, isComplex: true }] },
        { name, definitions: [{ name: "data", type: "uint8" }] },
      ];
      const reader = new MessageReader(definitions);
      expect(reader.readMessage<{ value: { data: number } }>(new Uint8Array([7])).value.data).toBe(
        7,
      );
    },
  );

  it("keeps distinct type names that have the same underscore spelling", () => {
    const definitions = parseMessageDefinition(
      "a/b_c first\na_b/c second\n===\nMSG: a/b_c\nuint8 x\n===\nMSG: a_b/c\nuint16 y",
    );
    const reader = new MessageReader(definitions);
    const message = reader.readMessage<{ first: { x: number }; second: { y: number } }>(
      new Uint8Array([1, 2, 3]),
    );
    expect(message.first.x).toBe(1);
    expect(message.second.y).toBe(770);
  });

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

  it.each([
    { description: "punctuation", typeName: "foo-msgs/Inner" },
    { description: "a line terminator", typeName: "foo\u2028msgs/Inner" },
  ])("rejects ROS type names containing $description before generating readers", ({ typeName }) => {
    const definitions = parseMessageDefinition(`Inner inner\n===\nMSG: ${typeName}\nstring data`);

    expect(() => new MessageReader(definitions)).toThrow(
      `'${typeName}' is not a valid ROS type name`,
    );
  });

  it("rejects empty type names before generating readers", () => {
    const definitions: MessageDefinition[] = [
      {
        name: "",
        definitions: [
          { name: "data", type: "uint8", isArray: false, isComplex: false, isConstant: false },
        ],
      },
    ];

    expect(() => new MessageReader(definitions)).toThrow("'' is not a valid ROS type name");
  });

  it("rejects invalid array lengths before generating readers", () => {
    const definitions: MessageDefinition[] = [
      {
        definitions: [
          {
            name: "data",
            type: "uint8",
            isArray: true,
            arrayLength: -1,
            isComplex: false,
            isConstant: false,
          },
        ],
      },
    ];

    expect(() => new MessageReader(definitions)).toThrow(/not a non-negative integer/);
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
