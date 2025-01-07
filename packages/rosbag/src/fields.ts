// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { Time } from "@foxglove/rostime";

// reads through a buffer and extracts { [key: string]: value: string }
// pairs - the buffer is expected to have length prefixed utf8 strings
// with a '=' separating the key and value
const EQUALS_CHARCODE = "=".charCodeAt(0);

export function extractFields(buffer: Uint8Array): Record<string, Uint8Array> {
  if (buffer.length < 4) {
    throw new Error("fields are truncated.");
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  const fields: Record<string, Uint8Array> = {};

  while (offset < buffer.length) {
    const length = view.getInt32(offset, true);
    offset += 4;

    if (offset + length > buffer.length) {
      throw new Error("Header fields are corrupt.");
    }

    const field = buffer.subarray(offset, offset + length);
    const index = field.indexOf(EQUALS_CHARCODE);
    if (index === -1) {
      throw new Error("Header field is missing equals sign.");
    }

    const fieldName = new TextDecoder().decode(field.subarray(0, index));
    fields[fieldName] = field.subarray(index + 1);
    offset += length;
  }

  return fields;
}

// reads a Time object out of a buffer at the given offset
export function extractTime(buffer: Uint8Array, offset: number): Time {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const sec = view.getUint32(offset, true);
  const nsec = view.getUint32(offset + 4, true);
  return { sec, nsec };
}
