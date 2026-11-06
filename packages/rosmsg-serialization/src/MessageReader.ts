// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { MessageDefinition } from "@foxglove/message-definition";

import decodeString from "./decodeString";
import { resolveMessageDefinition } from "./resolveMessageDefinition";
import { validateMessageDefinitionsForCodegen } from "./validateMessageDefinitions";

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

interface TypedArrayConstructor {
  new (length?: number): TypedArray;
  new (buffer: ArrayBuffer, byteOffset: number, length: number): TypedArray;
  BYTES_PER_ELEMENT: number;
}

// this has hard-coded buffer reading functions for each
// of the standard message types http://docs.ros.org/api/std_msgs/html/index-msg.html
// eventually custom types decompose into these standard types
export class StandardTypeReader {
  buffer: ArrayBufferView;
  offset: number;
  view: DataView;

  constructor(buffer: ArrayBufferView) {
    this.buffer = buffer;
    this.offset = 0;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  json(): unknown {
    const resultString = this.string();
    try {
      return JSON.parse(resultString);
    } catch {
      return `Could not parse ${resultString}`;
    }
  }

  string(): string {
    const len = this.uint32();
    const totalOffset = this.view.byteOffset + this.offset;
    const maxLen = this.view.byteLength - this.offset;
    if (len < 0 || len > maxLen) {
      throw new RangeError(`String deserialization error: length ${len}, maxLength ${maxLen}`);
    }
    const data = new Uint8Array(this.view.buffer, totalOffset, len);
    this.offset += len;
    return decodeString(data);
  }

  bool(): boolean {
    return this.uint8() !== 0;
  }

  int8(): number {
    return this.view.getInt8(this.offset++);
  }

  uint8(): number {
    return this.view.getUint8(this.offset++);
  }

  typedArray(
    len: number | null | undefined,
    TypedArrayConstructor: TypedArrayConstructor,
  ): TypedArray {
    const arrayLength = len ?? this.uint32();
    const view = this.view;
    const totalOffset = this.offset + view.byteOffset;
    this.offset += arrayLength * TypedArrayConstructor.BYTES_PER_ELEMENT;

    // new TypedArray(...) will throw if you try to make a typed array on unaligned boundary
    // but for aligned access we can use a typed array and avoid any extra memory alloc/copy
    if (totalOffset % TypedArrayConstructor.BYTES_PER_ELEMENT === 0) {
      return new TypedArrayConstructor(view.buffer, totalOffset, arrayLength);
    }

    // copy the data to align it
    // using _set_ is slightly faster than slice on the array buffer according to benchmarks when written
    const size = TypedArrayConstructor.BYTES_PER_ELEMENT * arrayLength;
    const copy = new Uint8Array(size);
    copy.set(new Uint8Array(view.buffer, totalOffset, size));
    return new TypedArrayConstructor(copy.buffer, copy.byteOffset, arrayLength);
  }

  int16(): number {
    const result = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return result;
  }

  uint16(): number {
    const result = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return result;
  }

  int32(): number {
    const result = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return result;
  }

  uint32(): number {
    const result = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return result;
  }

  float32(): number {
    const result = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return result;
  }

  float64(): number {
    const result = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return result;
  }

  int64(): bigint {
    const offset = this.offset;
    this.offset += 8;
    return this.view.getBigInt64(offset, true);
  }

  uint64(): bigint {
    const offset = this.offset;
    this.offset += 8;
    return this.view.getBigUint64(offset, true);
  }

  time(): { sec: number; nsec: number } {
    const offset = this.offset;
    this.offset += 8;
    const sec = this.view.getUint32(offset, true);
    const nsec = this.view.getUint32(offset + 4, true);
    return { sec, nsec };
  }

  duration(): { sec: number; nsec: number } {
    const offset = this.offset;
    this.offset += 8;
    const sec = this.view.getInt32(offset, true);
    const nsec = this.view.getInt32(offset + 4, true);
    return { sec, nsec };
  }
}

type RecordConstructor = new (reader: StandardTypeReader) => unknown;
type ValueReader = (reader: StandardTypeReader) => unknown;
type FieldReader = { name: string; read: ValueReader };

const primitiveReaders = new Map<string, ValueReader>([
  ["json", (reader) => reader.json()],
  ["string", (reader) => reader.string()],
  ["bool", (reader) => reader.bool()],
  ["int8", (reader) => reader.int8()],
  ["uint8", (reader) => reader.uint8()],
  ["int16", (reader) => reader.int16()],
  ["uint16", (reader) => reader.uint16()],
  ["int32", (reader) => reader.int32()],
  ["uint32", (reader) => reader.uint32()],
  ["int64", (reader) => reader.int64()],
  ["uint64", (reader) => reader.uint64()],
  ["float32", (reader) => reader.float32()],
  ["float64", (reader) => reader.float64()],
  ["time", (reader) => reader.time()],
  ["duration", (reader) => reader.duration()],
]);

const typedArrayConstructors = new Map<string, TypedArrayConstructor>([
  ["int8", Int8Array],
  ["uint8", Uint8Array],
  ["int16", Int16Array],
  ["uint16", Uint16Array],
  ["int32", Int32Array],
  ["uint32", Uint32Array],
  ["int64", BigInt64Array],
  ["uint64", BigUint64Array],
  ["float32", Float32Array],
  ["float64", Float64Array],
]);

function createRecordClass(
  fields: readonly FieldReader[],
  options: { freeze?: boolean },
): RecordConstructor {
  function MessageRecord(this: Record<string, unknown>, reader: StandardTypeReader) {
    for (const field of fields) {
      this[field.name] = field.read(reader);
    }
    if (options.freeze === true) {
      Object.freeze(this);
    }
  }
  return MessageRecord as unknown as RecordConstructor;
}

export const createParsers = ({
  definitions,
  options = {},
  topLevelReaderKey,
}: {
  definitions: readonly MessageDefinition[];
  options?: { freeze?: boolean };
  topLevelReaderKey: string;
}): Map<string, new (reader: StandardTypeReader) => unknown> => {
  if (definitions.length === 0) {
    throw new Error("no types given");
  }
  validateMessageDefinitionsForCodegen(definitions);
  const rootType = definitions.find((type) => type.name == undefined) ?? definitions[0]!;
  const typeFields = new Map<MessageDefinition, FieldReader[]>();
  const constructors = new Map<MessageDefinition, RecordConstructor>();
  for (const type of definitions) {
    const fields: FieldReader[] = [];
    typeFields.set(type, fields);
    constructors.set(type, createRecordClass(fields, { freeze: options.freeze }));
  }
  for (const type of definitions) {
    const fields = typeFields.get(type)!;
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      let readElement: ValueReader;
      if (field.isComplex === true) {
        const Constructor = constructors.get(resolveMessageDefinition(definitions, field.type))!;
        readElement = (reader) => new Constructor(reader);
      } else {
        readElement = primitiveReaders.get(field.type)!;
      }
      let read = readElement;
      if (field.isArray === true) {
        const fixedLength = field.arrayLength;
        const TypedArrayType =
          field.isComplex === true ? undefined : typedArrayConstructors.get(field.type);
        if (TypedArrayType != undefined) {
          read = (reader) => reader.typedArray(fixedLength, TypedArrayType);
        } else {
          read = (reader) => {
            const length = fixedLength ?? reader.uint32();
            const values = new Array<unknown>(length);
            for (let index = 0; index < length; index++) {
              values[index] = readElement(reader);
            }
            return values;
          };
        }
      }
      fields.push({ name: field.name, read });
    }
  }
  const builtReaders = new Map<string, RecordConstructor>([
    [topLevelReaderKey, constructors.get(rootType)!],
  ]);
  for (const type of definitions) {
    if (type.name != undefined) {
      builtReaders.set(type.name, constructors.get(type)!);
    }
  }
  return builtReaders;
};

export class MessageReader {
  reader: new (reader: StandardTypeReader) => unknown;
  #lastReadByteLength = 0;
  #lastReadHadTrailingBytes = false;

  /**
   * True when the most recent decode finished before reaching the end of the buffer. This can
   * signal a schema/payload version mismatch.
   */
  lastReadHadTrailingBytes(): boolean {
    return this.#lastReadHadTrailingBytes;
  }

  /**
   * Number of bytes consumed by the most recent decode.
   */
  lastReadByteLength(): number {
    return this.#lastReadByteLength;
  }

  // takes an object message definition and returns
  // a message reader which can be used to read messages based
  // on the message definition
  constructor(definitions: readonly MessageDefinition[], options: { freeze?: boolean } = {}) {
    this.reader = createParsers({ definitions, options, topLevelReaderKey: "<toplevel>" }).get(
      "<toplevel>",
    )!;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  readMessage<T = unknown>(buffer: ArrayBufferView): T {
    const standardReaders = new StandardTypeReader(buffer);
    const value = new this.reader(standardReaders) as T;
    this.#lastReadByteLength = standardReaders.offset;
    this.#lastReadHadTrailingBytes = this.#lastReadByteLength < buffer.byteLength;
    return value;
  }
}
