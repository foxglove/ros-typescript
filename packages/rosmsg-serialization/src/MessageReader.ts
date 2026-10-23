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

const findTypeByName = (types: readonly MessageDefinition[], name = ""): NamedMessageDefinition => {
  let foundName = ""; // track name separately in a non-null variable to appease Flow
  const matches = types.filter((type) => {
    const typeName = type.name ?? "";
    // if the search is empty, return unnamed types
    if (!name) {
      return !typeName;
    }
    // return if the search is in the type name
    // or matches exactly if a fully-qualified name match is passed to us
    const nameEnd = name.includes("/") ? name : `/${name}`;
    if (typeName.endsWith(nameEnd)) {
      foundName = typeName;
      return true;
    }
    return false;
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected 1 top level type definition for '${name}' but found ${matches.length}.`,
    );
  }
  return { ...matches[0]!, name: foundName };
};

type NamedMessageDefinition = MessageDefinition & { name: string };

type RecordConstructor = new (reader: StandardTypeReader) => unknown;
type ValueReader = (reader: StandardTypeReader) => unknown;
type FieldReader = {
  name: string;
  read: ValueReader;
  // A plain assignment to `__proto__` would replace the record's prototype instead of creating a
  // field, so that name is defined as an own property.
  isProtoKey: boolean;
};

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

function primitiveReader(type: string): ValueReader {
  return (
    primitiveReaders.get(type) ??
    (() => {
      throw new Error(`Unsupported ROS 1 primitive type '${type}'`);
    })
  );
}

function createRecordClass(fields: readonly FieldReader[], freeze: boolean): RecordConstructor {
  return class MessageRecord {
    constructor(reader: StandardTypeReader) {
      const record = this as unknown as Record<string, unknown>;
      for (const field of fields) {
        const value = field.read(reader);
        if (field.isProtoKey) {
          Object.defineProperty(record, field.name, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        } else {
          record[field.name] = value;
        }
      }
      if (freeze) {
        Object.freeze(this);
      }
    }
  };
}

/**
 * Create a constructor for each message type that reads one message from a StandardTypeReader.
 * The returned map holds the root type under `topLevelReaderKey` and each named type under its name.
 * Message definitions are interpreted as data and never compiled into code.
 */
export const createParsers = ({
  definitions,
  options = {},
  topLevelReaderKey,
}: {
  definitions: readonly MessageDefinition[];
  options?: { freeze?: boolean };
  topLevelReaderKey: string;
}): Map<string, RecordConstructor> => {
  if (definitions.length === 0) {
    throw new Error(`no types given`);
  }

  const unnamedTypes = definitions.filter((type) => !type.name);
  if (unnamedTypes.length > 1) {
    throw new Error("multiple unnamed types");
  }

  const unnamedType = unnamedTypes.length > 0 ? unnamedTypes[0]! : definitions[0]!;

  // keep only definitions with a name
  const namedTypes: NamedMessageDefinition[] = definitions.filter(
    (type) => !!type.name,
  ) as NamedMessageDefinition[];

  // Constructors are created before their fields are filled in, so complex fields can refer to
  // types that appear later in the definition list.
  const freeze = options.freeze === true;
  const builtReaders = new Map<string, RecordConstructor>();
  const typeFields: [MessageDefinition, FieldReader[]][] = [];
  const addType = (key: string, type: MessageDefinition) => {
    const fields: FieldReader[] = [];
    typeFields.push([type, fields]);
    builtReaders.set(key, createRecordClass(fields, freeze));
  };
  addType(topLevelReaderKey, unnamedType);
  for (const type of namedTypes) {
    addType(type.name, type);
  }

  const complexReader = (typeName: string): ValueReader => {
    const RecordClass = builtReaders.get(findTypeByName(definitions, typeName).name)!;
    return (reader) => new RecordClass(reader);
  };

  for (const [type, fields] of typeFields) {
    for (const def of type.definitions) {
      if (def.isConstant === true) {
        continue;
      }

      let read: ValueReader;
      if (def.isArray === true) {
        const TypedArrayType = typedArrayConstructors.get(def.type);
        const fixedLength = def.arrayLength;
        if (TypedArrayType != undefined) {
          read = (reader) => reader.typedArray(fixedLength, TypedArrayType);
        } else {
          const readElement =
            def.isComplex === true ? complexReader(def.type) : primitiveReader(def.type);
          read = (reader) => {
            const length = fixedLength ?? reader.uint32();
            const array = new Array<unknown>(length);
            for (let i = 0; i < length; i++) {
              array[i] = readElement(reader);
            }
            return array;
          };
        }
      } else if (def.isComplex === true) {
        read = complexReader(def.type);
      } else {
        read = primitiveReader(def.type);
      }
      fields.push({ name: def.name, read, isProtoKey: def.name === "__proto__" });
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
