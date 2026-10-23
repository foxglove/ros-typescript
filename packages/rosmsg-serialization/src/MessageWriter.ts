// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { fixedSizeTypes, FixedSizeTypes } from "./BuiltinDeserialize";
import { stringLengthUtf8 } from "./stringLengthUtf8";

export interface Time {
  // whole seconds
  sec: number;
  // additional nanoseconds past the sec value
  nsec: number;
}

type NamedRosMsgDefinition = {
  name: string;
  definitions: MessageDefinitionField[];
};

// write a Time object to a DataView.
function writeTime(time: Time, view: DataView, offset: number): void {
  view.setUint32(offset, time.sec, true);
  view.setUint32(offset + 4, time.nsec, true);
}

class StandardTypeOffsetCalculator {
  offset = 0;

  // Returns the current offset and increments the next offset by `byteCount`.
  _incrementAndReturn(byteCount: number): number {
    const offset = this.offset;
    this.offset += byteCount;
    return offset;
  }

  bytes(byteCount: number): number {
    return this._incrementAndReturn(byteCount);
  }

  // These are not actually used in the StandardTypeWriter, so they must be kept in sync with those implementations.
  json(value: unknown): number {
    return this.string(JSON.stringify(value));
  }

  // The following are used in the StandardTypeWriter.
  string(value: string): number {
    // uint32 length
    if (typeof value !== "string") {
      throw new Error(`Expected string but got ${typeof value}`);
    }
    const length = 4 + stringLengthUtf8(value);
    return this._incrementAndReturn(length);
  }

  bool(): number {
    return this.uint8();
  }

  int8(): number {
    return this._incrementAndReturn(1);
  }

  uint8(): number {
    return this._incrementAndReturn(1);
  }

  int16(): number {
    return this._incrementAndReturn(2);
  }

  uint16(): number {
    return this._incrementAndReturn(2);
  }

  int32(): number {
    return this._incrementAndReturn(4);
  }

  uint32(): number {
    return this._incrementAndReturn(4);
  }

  float32(): number {
    return this._incrementAndReturn(4);
  }

  float64(): number {
    return this._incrementAndReturn(8);
  }

  int64(): number {
    return this._incrementAndReturn(8);
  }

  uint64(): number {
    return this._incrementAndReturn(8);
  }

  time(): number {
    return this._incrementAndReturn(8);
  }

  duration(): number {
    return this._incrementAndReturn(8);
  }
}

// this has hard-coded data writing functions for each
// of the standard message types http://docs.ros.org/api/std_msgs/html/index-msg.html
// eventually custom types decompose into these standard types
class StandardTypeWriter {
  data: Uint8Array;
  view: DataView;
  textEncoder?: TextEncoder;
  offsetCalculator: StandardTypeOffsetCalculator;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offsetCalculator = new StandardTypeOffsetCalculator();
  }

  // Copy the bytes of a typed array. Typed arrays use host byte order, and this package assumes
  // a little-endian host to match the ROS 1 wire format.
  bytes(source: ArrayBufferView): void {
    const offset = this.offsetCalculator.bytes(source.byteLength);
    this.data.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), offset);
  }

  json(value: unknown): void {
    this.string(JSON.stringify(value));
  }

  string(value: string): void {
    this.textEncoder ??= new TextEncoder();
    const stringOffset = this.offsetCalculator.string(value);
    const stringLength = this.offsetCalculator.offset - stringOffset - 4;
    this.view.setUint32(stringOffset, stringLength, true);
    const { read, written } = this.textEncoder.encodeInto(
      value,
      this.data.subarray(stringOffset + 4),
    );
    if (read !== value.length) {
      throw new Error(
        `Not enough space to encode string into subarray (wrote ${read} of ${
          value.length
        } code units into ${written} of ${this.data.subarray(stringOffset + 4).length} bytes)`,
      );
    }
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  bool(value: boolean): void {
    this.uint8(value ? 1 : 0);
  }

  int8(value: number): void {
    this.view.setInt8(this.offsetCalculator.int8(), value);
  }

  uint8(value: number): void {
    this.view.setUint8(this.offsetCalculator.uint8(), value);
  }

  int16(value: number): void {
    this.view.setInt16(this.offsetCalculator.int16(), value, true);
  }

  uint16(value: number): void {
    this.view.setUint16(this.offsetCalculator.uint16(), value, true);
  }

  int32(value: number): void {
    this.view.setInt32(this.offsetCalculator.int32(), value, true);
  }

  uint32(value: number): void {
    this.view.setUint32(this.offsetCalculator.uint32(), value, true);
  }

  float32(value: number): void {
    this.view.setFloat32(this.offsetCalculator.float32(), value, true);
  }

  float64(value: number): void {
    this.view.setFloat64(this.offsetCalculator.float64(), value, true);
  }

  int64(value: bigint | number): void {
    this.view.setBigInt64(this.offsetCalculator.int64(), BigInt(value), true);
  }

  uint64(value: bigint | number): void {
    this.view.setBigUint64(this.offsetCalculator.uint64(), BigInt(value), true);
  }

  time(time: Time): void {
    writeTime(time, this.view, this.offsetCalculator.time());
  }

  duration(time: Time): void {
    writeTime(time, this.view, this.offsetCalculator.time());
  }
}

const findTypeByName = (types: MessageDefinition[], name = ""): NamedRosMsgDefinition => {
  let foundName = ""; // track name separately in a non-null variable to appease Flow
  const matches = types.filter((type) => {
    const typeName = type.name ?? "";
    // if the search is empty, return unnamed types
    if (name.length === 0) {
      return typeName.length === 0;
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

type WriterAndSizeCalculator = {
  writer: (message: unknown, output: Uint8Array) => Uint8Array;
  byteSizeCalculator: (message: unknown) => number;
};

// Fields are visited the same way to write a message and to calculate its size; only the target
// differs.
type WriteTarget = StandardTypeWriter | StandardTypeOffsetCalculator;
type ValueWriter = (target: WriteTarget, value: unknown) => void;
type FieldWriter = (target: WriteTarget, message: unknown) => void;

const primitiveWriters = new Map<string, ValueWriter>([
  ["json", (target, value) => target.json(value)],
  ["string", (target, value) => target.string(value as string)],
  ["bool", (target, value) => target.bool(value as boolean)],
  ["int8", (target, value) => target.int8(value as number)],
  ["uint8", (target, value) => target.uint8(value as number)],
  ["int16", (target, value) => target.int16(value as number)],
  ["uint16", (target, value) => target.uint16(value as number)],
  ["int32", (target, value) => target.int32(value as number)],
  ["uint32", (target, value) => target.uint32(value as number)],
  ["int64", (target, value) => target.int64(value as bigint | number)],
  ["uint64", (target, value) => target.uint64(value as bigint | number)],
  ["float32", (target, value) => target.float32(value as number)],
  ["float64", (target, value) => target.float64(value as number)],
  ["time", (target, value) => target.time(value as Time)],
  ["duration", (target, value) => target.duration(value as Time)],
]);

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array;

const typedArrayTypes = new Map<string, abstract new (...args: never[]) => TypedArray>([
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

function primitiveWriter(type: string): ValueWriter {
  return (
    primitiveWriters.get(type) ??
    (() => {
      throw new Error(`Unsupported ROS 1 primitive type '${type}'`);
    })
  );
}

function writeFields(fields: readonly FieldWriter[], target: WriteTarget, message: unknown): void {
  for (const field of fields) {
    field(target, message);
  }
}

function createWriterAndSizeCalculator(types: MessageDefinition[]): WriterAndSizeCalculator {
  if (types.length === 0) {
    throw new Error(`no types given`);
  }

  const unnamedTypes = types.filter((type) => type.name == undefined);
  if (unnamedTypes.length > 1) {
    throw new Error("multiple unnamed types");
  }

  const unnamedType = unnamedTypes.length > 0 ? unnamedTypes[0]! : types[0]!;

  const namedTypes: NamedRosMsgDefinition[] = types.filter(
    (type) => type.name != undefined,
  ) as NamedRosMsgDefinition[];

  // Field lists are created before they are filled in, so complex fields can refer to types that
  // appear later in the definition list.
  const rootFields: FieldWriter[] = [];
  const typeFields: [MessageDefinition, FieldWriter[]][] = [[unnamedType, rootFields]];
  const fieldsByName = new Map<string, FieldWriter[]>();
  for (const type of namedTypes) {
    const fields: FieldWriter[] = [];
    typeFields.push([type, fields]);
    fieldsByName.set(type.name, fields);
  }

  for (const [type, fields] of typeFields) {
    for (const def of type.definitions) {
      if (def.isConstant ?? false) {
        continue;
      }

      const name = def.name;
      let writeValue: ValueWriter;
      if (def.isComplex ?? false) {
        const subFields = fieldsByName.get(findTypeByName(types, def.type).name)!;
        writeValue = (target, value) => {
          writeFields(subFields, target, value);
        };
      } else {
        writeValue = primitiveWriter(def.type);
      }

      if (def.isArray ?? false) {
        const fixedLength = def.arrayLength;
        const elementSize =
          (def.isComplex ?? false) ? undefined : fixedSizeTypes.get(def.type as FixedSizeTypes);
        const TypedArrayType = (def.isComplex ?? false) ? undefined : typedArrayTypes.get(def.type);
        fields.push((target, message) => {
          const array = (message as Record<string, unknown>)[name] as ArrayLike<unknown>;
          // Fixed-length arrays have no length prefix
          const length = fixedLength ?? array.length;
          if (fixedLength == undefined) {
            target.uint32(length);
          }
          if (elementSize != undefined && target instanceof StandardTypeOffsetCalculator) {
            target.bytes(length * elementSize);
            return;
          }
          if (
            TypedArrayType != undefined &&
            target instanceof StandardTypeWriter &&
            array instanceof TypedArrayType &&
            array.length >= length
          ) {
            target.bytes(array.subarray(0, length));
            return;
          }
          for (let i = 0; i < length; i++) {
            writeValue(target, array[i]);
          }
        });
      } else {
        fields.push((target, message) => {
          writeValue(target, (message as Record<string, unknown>)[name]);
        });
      }
    }
  }

  return {
    writer(message: unknown, data: Uint8Array): Uint8Array {
      const writer = new StandardTypeWriter(data);
      writeFields(rootFields, writer, message);
      return writer.data;
    },
    byteSizeCalculator(message: unknown): number {
      const offsetCalculator = new StandardTypeOffsetCalculator();
      writeFields(rootFields, offsetCalculator, message);
      return offsetCalculator.offset;
    },
  };
}

export class MessageWriter {
  writer: (message: unknown, output: Uint8Array) => Uint8Array;
  byteSizeCalculator: (message: unknown) => number;

  // takes an object string message definition and returns
  // a message writer which can be used to write messages based
  // on the message definition
  constructor(definitions: MessageDefinition[]) {
    const { writer, byteSizeCalculator } = createWriterAndSizeCalculator(definitions);
    this.writer = writer;
    this.byteSizeCalculator = byteSizeCalculator;
  }

  // Calculates the byte size needed to write this message in bytes.
  calculateByteSize(message: unknown): number {
    return this.byteSizeCalculator(message);
  }

  // output is optional - if it is not provided, a Uint8Array will be generated.
  writeMessage(message: unknown, output?: Uint8Array): Uint8Array {
    return this.writer(message, output ?? new Uint8Array(this.calculateByteSize(message)));
  }
}
