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

type RecordData = Record<string, unknown>;
type Parser = { new (reader: StandardTypeReader): RecordData; prototype: RecordData };
type Primitive = Exclude<keyof StandardTypeReader, "buffer" | "offset" | "view" | "typedArray">;
type Layout = {
  Parser: Parser;
  fields: {
    name: string;
    element: Primitive | Layout;
    array: boolean;
    length?: number;
    typedArray?: TypedArrayConstructor;
  }[];
};

function toTypedArrayType(rosType: string): TypedArrayConstructor | undefined {
  switch (rosType) {
    case "int8":
      return Int8Array;
    case "uint8":
      return Uint8Array;
    case "int16":
      return Int16Array;
    case "uint16":
      return Uint16Array;
    case "int32":
      return Int32Array;
    case "uint32":
      return Uint32Array;
    case "int64":
      return BigInt64Array;
    case "uint64":
      return BigUint64Array;
    case "float32":
      return Float32Array;
    case "float64":
      return Float64Array;
    default:
      return undefined;
  }
}

function decode(
  reader: StandardTypeReader,
  root: Layout,
  message: RecordData,
  options: { freeze?: boolean },
): void {
  function read(
    layout: Layout,
    record = Object.create(layout.Parser.prototype) as RecordData,
  ): RecordData {
    for (const { name, element, array, length, typedArray } of layout.fields) {
      if (typedArray != undefined) {
        record[name] = reader.typedArray(length, typedArray);
      } else {
        const next = () => (typeof element === "string" ? reader[element]() : read(element));
        record[name] = array ? Array.from({ length: length ?? reader.uint32() }, next) : next();
      }
    }
    return options.freeze === true ? Object.freeze(record) : record;
  }
  read(root, message);
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
    throw new Error(`no types given`);
  }
  validateMessageDefinitionsForCodegen(definitions);

  const unnamedTypes = definitions.filter((type) => !type.name);
  if (unnamedTypes.length > 1) {
    throw new Error("multiple unnamed types");
  }

  const root = unnamedTypes[0] ?? definitions[0]!;
  const layouts = new Map<MessageDefinition, Layout>();
  const recordOptions = { freeze: options.freeze };
  for (const type of definitions) {
    function Parse(this: RecordData, reader: StandardTypeReader): void {
      decode(reader, layout, this, recordOptions);
    }
    const layout: Layout = { Parser: Parse as typeof Parse & Parser, fields: [] };
    layouts.set(type, layout);
  }

  const parsers = new Map([[topLevelReaderKey, layouts.get(root)!.Parser]]);
  for (const [type, layout] of layouts) {
    if (type.name != undefined) {
      parsers.set(type.name, layout.Parser);
    }
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      const element =
        field.isComplex === true
          ? layouts.get(resolveMessageDefinition(definitions, field.type))!
          : (field.type as Primitive);
      layout.fields.push({
        name: field.name,
        element,
        array: field.isArray === true,
        length: field.arrayLength,
        typedArray:
          field.isArray === true && typeof element === "string"
            ? toTypedArrayType(element)
            : undefined,
      });
    }
  }
  return parsers;
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
