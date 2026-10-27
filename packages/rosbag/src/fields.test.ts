// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { extractFields } from "./fields";

function stringToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe("fields", () => {
  it("should extract fields from a buffer", () => {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32LE(7, 0);
    buffer.write("foo=bar", 4);
    buffer.writeUInt32LE(9, 11);
    buffer.write("key=value", 15);

    const result = extractFields(Uint8Array.from([...buffer]));
    const expected = { foo: stringToUint8("bar"), key: stringToUint8("value") };
    expect(result).toEqual(expected);
  });

  it.each([8, 0x80000000, 0xffffffff])(
    "rejects field length %i that exceeds the buffer",
    (fieldLength) => {
      const buffer = Buffer.alloc(11);
      buffer.writeUInt32LE(fieldLength, 0);
      buffer.write("foo=bar", 4);

      expect(() => extractFields(Uint8Array.from([...buffer]))).toThrow(
        "Header fields are corrupt.",
      );
    },
  );

  it.each([1, 2, 3])("rejects %i trailing bytes too short to hold a field length", (extra) => {
    const buffer = Buffer.alloc(11 + extra);
    buffer.writeUInt32LE(7, 0);
    buffer.write("foo=bar", 4);

    expect(() => extractFields(Uint8Array.from([...buffer]))).toThrow("Header fields are corrupt.");
  });

  it("does not let a __proto__ field replace the prototype of the returned fields", () => {
    const buffer = Buffer.alloc(15);
    buffer.writeUInt32LE(11, 0);
    buffer.write("__proto__=x", 4);

    const result = extractFields(Uint8Array.from([...buffer]));
    expect(result instanceof Uint8Array).toBe(false);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual(stringToUint8("x"));
  });
});
