// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

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
});
