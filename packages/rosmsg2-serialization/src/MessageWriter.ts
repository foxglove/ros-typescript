import { CdrWriter } from "@foxglove/cdr";
import {
  DefaultValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";

import { messageDefinitionHasDataFields } from "./messageDefinitionHasDataFields";

type PrimitiveWriter = (
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
) => void;
type PrimitiveArrayWriter = (
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arraySize?: number,
) => void;

const PRIMITIVE_SIZES = new Map<string, number>([
  ["bool", 1],
  ["int8", 1],
  ["uint8", 1],
  ["int16", 2],
  ["uint16", 2],
  ["int32", 4],
  ["uint32", 4],
  ["int64", 8],
  ["uint64", 8],
  ["float32", 4],
  ["float64", 8],
  // ["string", ...], // handled separately
  ["time", 8],
  ["duration", 8],
]);

const PRIMITIVE_WRITERS = new Map<string, PrimitiveWriter>([
  ["bool", bool],
  ["int8", int8],
  ["uint8", uint8],
  ["int16", int16],
  ["uint16", uint16],
  ["int32", int32],
  ["uint32", uint32],
  ["int64", int64],
  ["uint64", uint64],
  ["float32", float32],
  ["float64", float64],
  ["string", string],
  ["time", time],
  ["duration", time],
  ["wstring", throwOnWstring],
]);

const PRIMITIVE_ARRAY_WRITERS = new Map<string, PrimitiveArrayWriter>([
  ["bool", boolArray],
  ["int8", int8Array],
  ["uint8", uint8Array],
  ["int16", int16Array],
  ["uint16", uint16Array],
  ["int32", int32Array],
  ["uint32", uint32Array],
  ["int64", int64Array],
  ["uint64", uint64Array],
  ["float32", float32Array],
  ["float64", float64Array],
  ["string", stringArray],
  ["time", timeArray],
  ["duration", timeArray],
  ["wstring", throwOnWstring],
]);

function throwOnWstring(): never {
  throw new Error("wstring is implementation-defined and therefore not supported");
}

/**
 * Takes a parsed message definition and returns a message writer which
 * serializes JavaScript objects to CDR-encoded binary.
 */
export class MessageWriter {
  #rootDefinition: MessageDefinitionField[];
  #definitions: Map<string, MessageDefinitionField[]>;

  public constructor(definitions: MessageDefinition[]) {
    // ros2idl modules could have constant modules before the root struct used to decode message
    const rootDefinition = definitions.find((def) => !isConstantModule(def));
    if (rootDefinition == undefined) {
      throw new Error("MessageReader initialized with no root MessageDefinition");
    }
    this.#rootDefinition = rootDefinition.definitions;
    this.#definitions = new Map<string, MessageDefinitionField[]>(
      definitions.map((def) => [def.name ?? "", def.definitions]),
    );
  }

  /** Calculates the byte size needed to write this message in bytes. */
  public calculateByteSize(message: unknown): number {
    return this.#byteSize(this.#rootDefinition, message, 4);
  }

  /**
   * Serializes a JavaScript object to CDR-encoded binary according to this
   * writer's message definition. If output is provided, it's byte length must
   * be equal or greater to the result of `calculateByteSize(message)`. If not
   * provided, a new Uint8Array will be allocated.
   */
  public writeMessage(message: unknown, output?: Uint8Array): Uint8Array {
    const writer = new CdrWriter({
      buffer: output,
      size: output ? undefined : this.calculateByteSize(message),
    });
    this.#write(this.#rootDefinition, message, writer);
    return writer.data;
  }

  #byteSize(definition: MessageDefinitionField[], message: unknown, offset: number): number {
    const messageObj = message as Record<string, unknown> | undefined;
    let newOffset = offset;

    if (!messageDefinitionHasDataFields(definition)) {
      // In case a message definition definition is empty, ROS 2 adds a
      // `uint8 structure_needs_at_least_one_member` field when converting to IDL,
      // to satisfy the requirement from IDL of not being empty.
      // See also https://design.ros2.org/articles/legacy_interface_definition.html
      return offset + this.#getPrimitiveSize("uint8");
    }

    for (const field of definition) {
      if (field.isConstant === true) {
        continue;
      }

      const nestedMessage = messageObj?.[field.name];

      if (field.isArray === true) {
        const arrayLength = field.arrayLength ?? fieldLength(nestedMessage);
        const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
        const dataArray = (dataIsArray ? nestedMessage : []) as unknown[];

        if (field.arrayLength == undefined) {
          // uint32 array length for dynamic arrays
          newOffset += padding(newOffset, 4);
          newOffset += 4;
        }

        if (field.isComplex === true) {
          // Complex type array
          const nestedDefinition = this.#getDefinition(field.type);
          for (let i = 0; i < arrayLength; i++) {
            const entry = (dataArray[i] ?? {}) as Record<string, unknown>;
            newOffset = this.#byteSize(nestedDefinition, entry, newOffset);
          }
        } else if (field.type === "string") {
          // String array
          for (let i = 0; i < arrayLength; i++) {
            const entry = (dataArray[i] ?? "") as string;
            newOffset += padding(newOffset, 4);
            newOffset += 4 + entry.length + 1; // uint32 length prefix, string, null terminator
          }
        } else {
          // Primitive array
          const entrySize = this.#getPrimitiveSize(field.type);
          const alignment = field.type === "time" || field.type === "duration" ? 4 : entrySize;
          newOffset += padding(newOffset, alignment);
          newOffset += entrySize * arrayLength;
        }
      } else {
        if (field.isComplex === true) {
          // Complex type
          const nestedDefinition = this.#getDefinition(field.type);
          const entry = (nestedMessage ?? {}) as Record<string, unknown>;
          newOffset = this.#byteSize(nestedDefinition, entry, newOffset);
        } else if (field.type === "string") {
          // String
          const entry = typeof nestedMessage === "string" ? nestedMessage : "";
          newOffset += padding(newOffset, 4);
          newOffset += 4 + entry.length + 1; // uint32 length prefix, string, null terminator
        } else {
          // Primitive
          const entrySize = this.#getPrimitiveSize(field.type);
          const alignment = field.type === "time" || field.type === "duration" ? 4 : entrySize;
          newOffset += padding(newOffset, alignment);
          newOffset += entrySize;
        }
      }
    }

    return newOffset;
  }

  #write(definition: MessageDefinitionField[], message: unknown, writer: CdrWriter): void {
    const messageObj = message as Record<string, unknown> | undefined;

    if (!messageDefinitionHasDataFields(definition)) {
      // In case a message definition definition is empty, ROS 2 adds a
      // `uint8 structure_needs_at_least_one_member` field when converting to IDL,
      // to satisfy the requirement from IDL of not being empty.
      // See also https://design.ros2.org/articles/legacy_interface_definition.html
      uint8(0, 0, writer);
      return;
    }

    for (const field of definition) {
      if (field.isConstant === true) {
        continue;
      }

      const nestedMessage = messageObj?.[field.name];

      if (field.isArray === true) {
        const arrayLength = field.arrayLength ?? fieldLength(nestedMessage);
        const dataIsArray = Array.isArray(nestedMessage) || ArrayBuffer.isView(nestedMessage);
        const dataArray = (dataIsArray ? nestedMessage : []) as unknown[];

        if (field.arrayLength == undefined) {
          // uint32 array length for dynamic arrays
          writer.sequenceLength(arrayLength);
        }

        if (field.arrayLength != undefined && nestedMessage != undefined) {
          const givenFieldLength = fieldLength(nestedMessage);
          if (givenFieldLength !== field.arrayLength) {
            throw new Error(
              `Expected ${field.arrayLength} items for fixed-length array field ${field.name} but received ${givenFieldLength}`,
            );
          }
        }

        if (field.isComplex === true) {
          // Complex type array
          const nestedDefinition = this.#getDefinition(field.type);
          for (let i = 0; i < arrayLength; i++) {
            const entry = dataArray[i] ?? {};
            this.#write(nestedDefinition, entry, writer);
          }
        } else {
          // Primitive array
          const arrayWriter = this.#getPrimitiveArrayWriter(field.type);
          arrayWriter(nestedMessage, field.defaultValue, writer, field.arrayLength);
        }
      } else {
        if (field.isComplex === true) {
          // Complex type
          const nestedDefinition = this.#getDefinition(field.type);
          const entry = nestedMessage ?? {};
          this.#write(nestedDefinition, entry, writer);
        } else {
          // Primitive
          const primitiveWriter = this.#getPrimitiveWriter(field.type);
          primitiveWriter(nestedMessage, field.defaultValue, writer);
        }
      }
    }
  }

  #getDefinition(datatype: string) {
    const nestedDefinition = this.#definitions.get(datatype);
    if (nestedDefinition == undefined) {
      throw new Error(`Unrecognized complex type ${datatype}`);
    }
    return nestedDefinition;
  }

  #getPrimitiveSize(primitiveType: string) {
    const size = PRIMITIVE_SIZES.get(primitiveType);
    if (size == undefined) {
      if (primitiveType === "wstring") {
        throwOnWstring();
      }
      throw new Error(`Unrecognized primitive type ${primitiveType}`);
    }
    return size;
  }

  #getPrimitiveWriter(primitiveType: string) {
    const writer = PRIMITIVE_WRITERS.get(primitiveType);
    if (writer == undefined) {
      throw new Error(`Unrecognized primitive type ${primitiveType}`);
    }
    return writer;
  }

  #getPrimitiveArrayWriter(primitiveType: string) {
    const writer = PRIMITIVE_ARRAY_WRITERS.get(primitiveType);
    if (writer == undefined) {
      throw new Error(`Unrecognized primitive type ${primitiveType}[]`);
    }
    return writer;
  }
}

function isConstantModule(def: MessageDefinition): boolean {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  return def.definitions.length > 0 && def.definitions.every((field) => field.isConstant);
}

function fieldLength(value: unknown): number {
  const length = (value as { length?: unknown } | undefined)?.length;
  return typeof length === "number" ? length : 0;
}

function bool(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  const boolValue = typeof value === "boolean" ? value : ((defaultValue ?? false) as boolean);
  writer.int8(boolValue ? 1 : 0);
}

function int8(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.int8(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function uint8(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.uint8(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function int16(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.int16(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function uint16(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.uint16(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function int32(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.int32(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function uint32(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.uint32(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function int64(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  if (typeof value === "bigint") {
    writer.int64(value);
  } else if (typeof value === "number") {
    writer.int64(BigInt(value));
  } else {
    writer.int64((defaultValue ?? 0n) as bigint);
  }
}

function uint64(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  if (typeof value === "bigint") {
    writer.uint64(value);
  } else if (typeof value === "number") {
    writer.uint64(BigInt(value));
  } else {
    writer.uint64((defaultValue ?? 0n) as bigint);
  }
}

function float32(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.float32(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function float64(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.float64(typeof value === "number" ? value : ((defaultValue ?? 0) as number));
}

function string(value: unknown, defaultValue: DefaultValue, writer: CdrWriter): void {
  writer.string(typeof value === "string" ? value : ((defaultValue ?? "") as string));
}

function time(value: unknown, _defaultValue: DefaultValue, writer: CdrWriter): void {
  if (value == undefined) {
    writer.int32(0);
    writer.uint32(0);
    return;
  }
  const timeObj = value as { sec?: number; nsec?: number; nanosec?: number };
  writer.int32(timeObj.sec ?? 0);
  writer.uint32(timeObj.nsec ?? timeObj.nanosec ?? 0);
}

function boolArray(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (Array.isArray(value)) {
    const array = new Int8Array(value);
    writer.int8Array(array);
  } else {
    writer.int8Array((defaultValue ?? new Int8Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function int8Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Int8Array) {
    writer.int8Array(value);
  } else if (Array.isArray(value)) {
    const array = new Int8Array(value);
    writer.int8Array(array);
  } else {
    writer.int8Array((defaultValue ?? new Int8Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function uint8Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Uint8Array) {
    writer.uint8Array(value);
  } else if (value instanceof Uint8ClampedArray) {
    writer.uint8Array(new Uint8Array(value));
  } else if (Array.isArray(value)) {
    const array = new Uint8Array(value);
    writer.uint8Array(array);
  } else {
    writer.uint8Array((defaultValue ?? new Uint8Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function int16Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Int16Array) {
    writer.int16Array(value);
  } else if (Array.isArray(value)) {
    const array = new Int16Array(value);
    writer.int16Array(array);
  } else {
    writer.int16Array((defaultValue ?? new Int16Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function uint16Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Uint16Array) {
    writer.uint16Array(value);
  } else if (Array.isArray(value)) {
    const array = new Uint16Array(value);
    writer.uint16Array(array);
  } else {
    writer.uint16Array((defaultValue ?? new Uint16Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function int32Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Int32Array) {
    writer.int32Array(value);
  } else if (Array.isArray(value)) {
    const array = new Int32Array(value);
    writer.int32Array(array);
  } else {
    writer.int32Array((defaultValue ?? new Int32Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function uint32Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Uint32Array) {
    writer.uint32Array(value);
  } else if (Array.isArray(value)) {
    const array = new Uint32Array(value);
    writer.uint32Array(array);
  } else {
    writer.uint32Array((defaultValue ?? new Uint32Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function int64Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof BigInt64Array) {
    writer.int64Array(value);
  } else if (Array.isArray(value)) {
    const array = new BigInt64Array(value);
    writer.int64Array(array);
  } else {
    writer.int64Array((defaultValue ?? new BigInt64Array(arrayLength ?? 0).fill(0n)) as bigint[]);
  }
}

function uint64Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof BigUint64Array) {
    writer.uint64Array(value);
  } else if (Array.isArray(value)) {
    const array = new BigUint64Array(value);
    writer.uint64Array(array);
  } else {
    writer.uint64Array((defaultValue ?? new BigUint64Array(arrayLength ?? 0).fill(0n)) as bigint[]);
  }
}

function float32Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Float32Array) {
    writer.float32Array(value);
  } else if (Array.isArray(value)) {
    const array = new Float32Array(value);
    writer.float32Array(array);
  } else {
    writer.float32Array((defaultValue ?? new Float32Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function float64Array(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (value instanceof Float64Array) {
    writer.float64Array(value);
  } else if (Array.isArray(value)) {
    const array = new Float64Array(value);
    writer.float64Array(array);
  } else {
    writer.float64Array((defaultValue ?? new Float64Array(arrayLength ?? 0).fill(0)) as number[]);
  }
}

function stringArray(
  value: unknown,
  defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      writer.string(typeof item === "string" ? item : "");
    }
  } else {
    const array = (defaultValue ?? new Array(arrayLength ?? 0).fill("")) as string[];
    for (const item of array) {
      writer.string(item);
    }
  }
}

function timeArray(
  value: unknown,
  _defaultValue: DefaultValue,
  writer: CdrWriter,
  arrayLength?: number,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      time(item, undefined, writer);
    }
  } else {
    const array = new Array(arrayLength).fill(undefined) as undefined[];
    for (const item of array) {
      time(item, undefined, writer);
    }
  }
}

function padding(offset: number, byteWidth: number): number {
  // The four byte header is not considered for alignment
  const alignment = (offset - 4) % byteWidth;
  return alignment > 0 ? byteWidth - alignment : 0;
}
