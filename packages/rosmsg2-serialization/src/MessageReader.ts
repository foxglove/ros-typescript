import { CdrReader } from "@foxglove/cdr";
import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";
import { Time as Ros1Time } from "@foxglove/rostime";

import { messageDefinitionHasDataFields } from "./messageDefinitionHasDataFields";

type Ros2Time = {
  sec: number;
  nanosec: number;
};

type Deserializer = (reader: CdrReader) => boolean | number | bigint | string | Ros1Time | Ros2Time;
type ArrayDeserializer = (
  reader: CdrReader,
  count: number,
) =>
  | boolean[]
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array
  | string[]
  | Ros1Time[]
  | Ros2Time[];

export type MessageReaderOptions = {
  /**
   * Select the type for deserialized `time` and `duration` values. "sec" and "nanosec" are used by
   * default in ROS 2, whereas "sec" and "nsec" originates from ROS 1 and matches
   * `@foxglove/rostime`.
   *
   * @default "sec,nanosec"
   */
  timeType?: "sec,nanosec" | "sec,nsec";
};

export class MessageReader<T = unknown> {
  #rootDefinition: MessageDefinitionField[];
  #definitions: Map<string, MessageDefinitionField[]>;
  #useRos1Time: boolean;

  public constructor(definitions: MessageDefinition[], options: MessageReaderOptions = {}) {
    const { timeType = "sec,nanosec" } = options;

    // ros2idl modules could have constant modules before the root struct used to decode message
    const rootDefinition = definitions.find((def) => !isConstantModule(def));

    if (rootDefinition == undefined) {
      throw new Error("MessageReader initialized with no root MessageDefinition");
    }
    this.#rootDefinition = rootDefinition.definitions;
    this.#definitions = new Map<string, MessageDefinitionField[]>(
      definitions.map((def) => [def.name ?? "", def.definitions]),
    );
    this.#useRos1Time = timeType === "sec,nsec";
  }

  // We template on R here for call site type information if the class type information T is not
  // known or available
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public readMessage<R = T>(buffer: ArrayBufferView): R {
    const reader = new CdrReader(buffer);
    return this.#readComplexType(this.#rootDefinition, reader) as R;
  }

  #readComplexType(
    definition: MessageDefinitionField[],
    reader: CdrReader,
  ): Record<string, unknown> {
    const msg: Record<string, unknown> = {};

    if (!messageDefinitionHasDataFields(definition)) {
      // In case a message definition definition is empty, ROS 2 adds a
      // `uint8 structure_needs_at_least_one_member` field when converting to IDL,
      // to satisfy the requirement from IDL of not being empty.
      // See also https://design.ros2.org/articles/legacy_interface_definition.html
      reader.uint8();
      return msg;
    }

    for (const field of definition) {
      if (field.isConstant === true) {
        continue;
      }

      if (field.isComplex === true) {
        // Complex type
        const nestedDefinition = this.#definitions.get(field.type);
        if (nestedDefinition == undefined) {
          throw new Error(`Unrecognized complex type ${field.type}`);
        }

        if (field.isArray === true) {
          // For dynamic length arrays we need to read a uint32 prefix
          const arrayLength = field.arrayLength ?? reader.sequenceLength();
          const array = [];
          for (let i = 0; i < arrayLength; i++) {
            array.push(this.#readComplexType(nestedDefinition, reader));
          }
          msg[field.name] = array;
        } else {
          msg[field.name] = this.#readComplexType(nestedDefinition, reader);
        }
      } else {
        // Primitive type
        if (field.isArray === true) {
          const deser = (
            this.#useRos1Time ? ros1TypedArrayDeserializers : typedArrayDeserializers
          ).get(field.type);
          if (deser == undefined) {
            throw new Error(`Unrecognized primitive array type ${field.type}[]`);
          }
          // For dynamic length arrays we need to read a uint32 prefix
          const arrayLength = field.arrayLength ?? reader.sequenceLength();
          msg[field.name] = deser(reader, arrayLength);
        } else {
          const deser = (this.#useRos1Time ? ros1TimeDeserializers : deserializers).get(field.type);
          if (deser == undefined) {
            throw new Error(`Unrecognized primitive type ${field.type}`);
          }
          msg[field.name] = deser(reader);
        }
      }
    }
    return msg;
  }
}

function isConstantModule(def: MessageDefinition): boolean {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  return def.definitions.length > 0 && def.definitions.every((field) => field.isConstant);
}

const deserializers = new Map<string, Deserializer>([
  ["bool", (reader) => Boolean(reader.int8())],
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
  ["string", (reader) => reader.string()],
  ["wstring", throwOnWstring],
  ["time", (reader) => ({ sec: reader.int32(), nanosec: reader.uint32() })],
  ["duration", (reader) => ({ sec: reader.int32(), nanosec: reader.uint32() })],
]);
const ros1TimeDeserializers = new Map<string, Deserializer>([
  ...deserializers,
  ["time", (reader) => ({ sec: reader.int32(), nsec: reader.uint32() })],
  ["duration", (reader) => ({ sec: reader.int32(), nsec: reader.uint32() })],
]);

const typedArrayDeserializers = new Map<string, ArrayDeserializer>([
  ["bool", readBoolArray],
  ["int8", (reader, count) => reader.int8Array(count)],
  ["uint8", (reader, count) => reader.uint8Array(count)],
  ["int16", (reader, count) => reader.int16Array(count)],
  ["uint16", (reader, count) => reader.uint16Array(count)],
  ["int32", (reader, count) => reader.int32Array(count)],
  ["uint32", (reader, count) => reader.uint32Array(count)],
  ["int64", (reader, count) => reader.int64Array(count)],
  ["uint64", (reader, count) => reader.uint64Array(count)],
  ["float32", (reader, count) => reader.float32Array(count)],
  ["float64", (reader, count) => reader.float64Array(count)],
  ["string", readStringArray],
  ["wstring", throwOnWstring],
  ["time", readTimeArray],
  ["duration", readTimeArray],
]);
const ros1TypedArrayDeserializers = new Map<string, ArrayDeserializer>([
  ...typedArrayDeserializers,
  ["time", readRos1TimeArray],
  ["duration", readRos1TimeArray],
]);

function readBoolArray(reader: CdrReader, count: number): boolean[] {
  const array = new Array<boolean>(count);
  for (let i = 0; i < count; i++) {
    array[i] = Boolean(reader.int8());
  }
  return array;
}

function readStringArray(reader: CdrReader, count: number): string[] {
  const array = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    array[i] = reader.string();
  }
  return array;
}

function readRos1TimeArray(reader: CdrReader, count: number): Ros1Time[] {
  const array = new Array<Ros1Time>(count);
  for (let i = 0; i < count; i++) {
    const sec = reader.int32();
    const nsec = reader.uint32();
    array[i] = { sec, nsec };
  }
  return array;
}

function readTimeArray(reader: CdrReader, count: number): Ros2Time[] {
  const array = new Array<Ros2Time>(count);
  for (let i = 0; i < count; i++) {
    const sec = reader.int32();
    const nanosec = reader.uint32();
    array[i] = { sec, nanosec };
  }
  return array;
}

function throwOnWstring(): never {
  throw new Error("wstring is implementation-defined and therefore not supported");
}
