// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { MessageDefinition } from "@foxglove/message-definition";

import { resolveMessageDefinition } from "./resolveMessageDefinition";
import { stringLengthUtf8 } from "./stringLengthUtf8";
import { validateMessageDefinitionsForCodegen } from "./validateMessageDefinitions";

export interface Time {
  // whole seconds
  sec: number;
  // additional nanoseconds past the sec value
  nsec: number;
}

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

type WriterAndSizeCalculator = {
  writer: (message: unknown, output: Uint8Array) => Uint8Array;
  byteSizeCalculator: (message: unknown) => number;
};

type WriteTarget = StandardTypeWriter | StandardTypeOffsetCalculator;
type ValueWriter = (target: WriteTarget, value: unknown) => void;
type FieldWriter = (target: WriteTarget, message: Record<string, unknown>) => void;

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

type ArrayWriter = (target: WriteTarget, values: ArrayLike<unknown>, length: number) => void;

const primitiveArrayWriters = new Map<string, ArrayWriter>([
  [
    "bool",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.bool(values[index] as boolean);
      }
    },
  ],
  [
    "int8",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.int8(values[index] as number);
      }
    },
  ],
  [
    "uint8",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.uint8(values[index] as number);
      }
    },
  ],
  [
    "int16",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.int16(values[index] as number);
      }
    },
  ],
  [
    "uint16",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.uint16(values[index] as number);
      }
    },
  ],
  [
    "int32",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.int32(values[index] as number);
      }
    },
  ],
  [
    "uint32",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.uint32(values[index] as number);
      }
    },
  ],
  [
    "int64",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.int64(values[index] as bigint | number);
      }
    },
  ],
  [
    "uint64",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.uint64(values[index] as bigint | number);
      }
    },
  ],
  [
    "float32",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.float32(values[index] as number);
      }
    },
  ],
  [
    "float64",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.float64(values[index] as number);
      }
    },
  ],
  [
    "time",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.time(values[index] as Time);
      }
    },
  ],
  [
    "duration",
    (target, values, length) => {
      for (let index = 0; index < length; index++) {
        target.duration(values[index] as Time);
      }
    },
  ],
]);

function writeFields(fields: readonly FieldWriter[], target: WriteTarget, message: unknown): void {
  for (const field of fields) {
    field(target, message as Record<string, unknown>);
  }
}

function createWriterAndSizeCalculator(types: MessageDefinition[]): WriterAndSizeCalculator {
  if (types.length === 0) {
    throw new Error("no types given");
  }
  validateMessageDefinitionsForCodegen(types);
  const rootType = types.find((type) => type.name == undefined) ?? types[0]!;
  const typeFields = new Map<MessageDefinition, FieldWriter[]>();
  for (const type of types) {
    typeFields.set(type, []);
  }
  for (const type of types) {
    const fields = typeFields.get(type)!;
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      const name = field.name;
      let writeValue: ValueWriter;
      if (field.isComplex === true) {
        const subFields = typeFields.get(resolveMessageDefinition(types, field.type))!;
        writeValue = (target, value) => {
          writeFields(subFields, target, value);
        };
      } else {
        writeValue = primitiveWriters.get(field.type)!;
      }
      if (field.isArray === true) {
        const fixedLength = field.arrayLength;
        const writeArray =
          field.isComplex === true ? undefined : primitiveArrayWriters.get(field.type);
        fields.push((target, message) => {
          const values = message[name] as ArrayLike<unknown>;
          const length = fixedLength ?? values.length;
          if (fixedLength == undefined) {
            target.uint32(length);
          }
          if (writeArray != undefined) {
            writeArray(target, values, length);
          } else {
            for (let index = 0; index < length; index++) {
              writeValue(target, values[index]);
            }
          }
        });
      } else {
        fields.push((target, message) => {
          writeValue(target, message[name]);
        });
      }
    }
  }
  const rootFields = typeFields.get(rootType)!;
  return {
    writer(message: unknown, data: Uint8Array): Uint8Array {
      const writer = new StandardTypeWriter(data);
      writeFields(rootFields, writer, message);
      return writer.data;
    },
    byteSizeCalculator(message: unknown): number {
      const calculator = new StandardTypeOffsetCalculator();
      writeFields(rootFields, calculator, message);
      return calculator.offset;
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
