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
  it("does not compile message definitions into code", () => {
    const functionSpy = jest.spyOn(globalThis, "Function");
    const evalSpy = jest.spyOn(globalThis, "eval");
    try {
      const reader = new MessageReader(
        parseMessageDefinition("Inner[] inners\n===\nMSG: foo_msgs/Inner\nstring data"),
      );
      expect(reader.readMessage(Uint8Array.from([1, 0, 0, 0, ...getStringBuffer("a")]))).toEqual({
        inners: [{ data: "a" }],
      });
      expect(functionSpy).not.toHaveBeenCalled();
      expect(evalSpy).not.toHaveBeenCalled();
    } finally {
      functionSpy.mockRestore();
      evalSpy.mockRestore();
    }
  });

  it("treats field names as data", () => {
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

    const reader = new MessageReader(definitions);

    expect(reader.readMessage(getStringBuffer("value"))).toEqual({ [payloadName]: "value" });
    expect(globalWithMarker.rosmsgSerializationReaderInjected).toBeUndefined();
  });

  it.each([
    { description: "punctuation", typeName: "foo-msgs/Inner" },
    { description: "a line terminator", typeName: "foo\u2028msgs/Inner" },
  ])("treats type names containing $description as data", ({ typeName }) => {
    const reader = new MessageReader(
      parseMessageDefinition(`Inner inner\n===\nMSG: ${typeName}\nuint8 data`),
    );

    expect(reader.readMessage(Uint8Array.from([5]))).toEqual({ inner: { data: 5 } });
  });

  it("reads a field named __proto__ as an own property", () => {
    const definitions: MessageDefinition[] = [
      {
        definitions: [
          { name: "__proto__", type: "uint8", isArray: false, isComplex: false, isConstant: false },
        ],
      },
    ];

    const message = new MessageReader(definitions).readMessage<Record<string, unknown>>(
      Uint8Array.from([7]),
    );

    expect(Object.getOwnPropertyDescriptor(message, "__proto__")?.value).toBe(7);
    expect(Object.getPrototypeOf(message)).not.toBe(7);
  });

  it("rejects unsupported primitive types when reading", () => {
    const definitions: MessageDefinition[] = [
      {
        definitions: [
          { name: "data", type: "x/eval", isArray: false, isComplex: false, isConstant: false },
        ],
      },
    ];

    const reader = new MessageReader(definitions);

    expect(() => reader.readMessage(Uint8Array.from([0]))).toThrow(
      "Unsupported ROS 1 primitive type 'x/eval'",
    );
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
