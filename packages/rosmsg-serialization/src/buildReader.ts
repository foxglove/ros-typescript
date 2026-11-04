import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { deserializers, fixedSizeTypes, FixedSizeTypes } from "./BuiltinDeserialize";
import { createParsers, StandardTypeReader } from "./MessageReader";
import { resolveMessageDefinition } from "./resolveMessageDefinition";
import { validateMessageDefinitionsForCodegen } from "./validateMessageDefinitions";

const builtinSizes = {
  // strings are the only builtin type that are variable size
  string: (view: DataView, offset: number) => {
    const len = view.getUint32(offset, true);
    const maxLen = view.byteLength - offset - 4;
    if (len < 0 || len > maxLen) {
      throw new RangeError(`String length error: length ${len}, maxLength ${maxLen}`);
    }
    return 4 + len;
  },
  fixedArray: (
    view: DataView,
    startOffset: number,
    len: number,
    typeSize: (view: DataView, offset: number) => number,
  ): number => {
    let offset = startOffset;
    let size = 0;
    for (let idx = 0; idx < len; ++idx) {
      const elementSize = typeSize(view, offset);
      size += elementSize;
      offset += elementSize;
    }

    const maxSize = view.byteLength - startOffset;
    if (size > maxSize) {
      throw new RangeError(`Fixed array length error: size ${size}, maxSize ${maxSize}`);
    }

    return size;
  },
  array: (
    view: DataView,
    startOffset: number,
    typeSize: (view: DataView, offset: number) => number,
  ): number => {
    let offset = startOffset;
    const len = view.getUint32(offset, true);

    let size = 4;
    offset += 4;
    for (let idx = 0; idx < len; ++idx) {
      const elementSize = typeSize(view, offset);
      size += elementSize;
      offset += elementSize;
    }

    const maxSize = view.byteLength - startOffset;
    if (size > maxSize) {
      throw new RangeError(`Dynamic array length error: size ${size}, maxSize ${maxSize}`);
    }

    return size;
  },
};

interface SerializedMessageReader {
  build: (view: DataView, offset?: number) => unknown;
  size: (view: DataView, offset?: number) => number;
  source: () => string;
}

type ViewReader = (view: DataView, offset: number) => unknown;
type ViewSize = (view: DataView, offset: number) => number;
type ArrayReader = (view: DataView, offset: number, length: number) => unknown;
type LazyField = { name: string; read: ViewReader; size: ViewSize };
type LazyMessageClass = {
  build: (view: DataView, offset?: number) => unknown;
  size: (view: DataView, offset?: number) => number;
  prototype: object;
  readField: (message: never, index: number) => unknown;
};

function createLazyField(
  field: MessageDefinitionField,
  classes: Map<MessageDefinition, LazyMessageClass>,
  definitions: readonly MessageDefinition[],
): LazyField {
  const fixedLength = field.arrayLength;
  const fieldSize =
    field.isComplex === true ? undefined : fixedSizeTypes.get(field.type as FixedSizeTypes);
  if (fieldSize != undefined) {
    const read = deserializers[field.type as FixedSizeTypes] as ViewReader;
    if (field.isArray !== true) {
      return { name: field.name, read, size: () => fieldSize };
    }
    const readArray = deserializers[
      (field.type + "Array") as keyof typeof deserializers
    ] as ArrayReader;
    if (fixedLength != undefined) {
      const fixedSize = fieldSize * fixedLength;
      return {
        name: field.name,
        read: (view, offset) => readArray(view, offset, fixedLength),
        size: () => fixedSize,
      };
    }
    return {
      name: field.name,
      read: (view, offset) => readArray(view, offset + 4, view.getUint32(offset, true)),
      size: (view, offset) => 4 + view.getUint32(offset, true) * fieldSize,
    };
  }
  let readElement: ViewReader;
  let sizeElement: ViewSize;
  if (field.isComplex === true) {
    const type = resolveMessageDefinition(definitions, field.type);
    const messageClass = classes.get(type)!;
    readElement = messageClass.build;
    sizeElement = messageClass.size;
  } else if (field.type === "string") {
    readElement = deserializers.string;
    sizeElement = builtinSizes.string;
  } else {
    const type = field.type;
    const unsupported = (): never => {
      throw new Error(`Unsupported lazy primitive type '${type}'`);
    };
    readElement = unsupported;
    sizeElement = unsupported;
  }
  if (field.isArray !== true) {
    return { name: field.name, read: readElement, size: sizeElement };
  }
  if (fixedLength != undefined) {
    return {
      name: field.name,
      read: (view, offset) =>
        deserializers.fixedArray(view, offset, fixedLength, readElement, sizeElement),
      size: (view, offset) => builtinSizes.fixedArray(view, offset, fixedLength, sizeElement),
    };
  }
  return {
    name: field.name,
    read: (view, offset) => deserializers.dynamicArray(view, offset, readElement, sizeElement),
    size: (view, offset) => builtinSizes.array(view, offset, sizeElement),
  };
}

function createLazyMessageClass(
  fields: readonly LazyField[],
  toObject: (view: DataView, offset: number) => unknown,
): LazyMessageClass {
  class LazyMessage {
    readonly #view: DataView;
    readonly #offset: number;
    #fieldOffsets: (number | undefined)[] | undefined;

    constructor(view: DataView, offset = 0) {
      this.#view = view;
      this.#offset = offset;
    }

    static size(view: DataView, initialOffset = 0): number {
      let offset = initialOffset;
      for (const field of fields) {
        offset += field.size(view, offset);
      }
      return offset - initialOffset;
    }

    static build(view: DataView, offset = 0): LazyMessage {
      return new LazyMessage(view, offset);
    }

    static readField(message: LazyMessage, index: number): unknown {
      if (index === 0) {
        return fields[index]!.read(message.#view, message.#offset);
      }
      const offsets = (message.#fieldOffsets ??= []);
      let known = index;
      while (known > 0 && offsets[known] == undefined) {
        known--;
      }
      let offset = known === 0 ? message.#offset : offsets[known]!;
      for (let current = known; current < index; current++) {
        offset += fields[current]!.size(message.#view, offset);
        offsets[current + 1] = offset;
      }
      return fields[index]!.read(message.#view, offset);
    }

    toJSON(): unknown {
      return toObject(this.#view, this.#offset);
    }

    toObject(): unknown {
      return toObject(this.#view, this.#offset);
    }
  }
  return LazyMessage;
}

export default function buildReader(
  definitions: readonly MessageDefinition[],
): SerializedMessageReader {
  validateMessageDefinitionsForCodegen(definitions);
  const rootType = definitions.find((type) => type.name == undefined) ?? definitions[0];
  if (rootType == undefined) {
    throw new Error("no types given");
  }
  for (const type of definitions) {
    for (const field of type.definitions) {
      if (field.isConstant !== true && (field.name === "toObject" || field.name === "toJSON")) {
        throw new Error(`ROS field '${field.name}' conflicts with a lazy message method`);
      }
    }
  }
  const rootKey = "__RootMsg";
  const typeReaders = createParsers({ definitions, topLevelReaderKey: rootKey });
  const classes = new Map<MessageDefinition, LazyMessageClass>();
  const typeFields = new Map<MessageDefinition, LazyField[]>();
  for (const type of definitions) {
    const fields: LazyField[] = [];
    typeFields.set(type, fields);
    const Reader = typeReaders.get(type.name ?? rootKey)!;
    classes.set(
      type,
      createLazyMessageClass(fields, (view, offset) => {
        const buffer = new Uint8Array(
          view.buffer,
          view.byteOffset + offset,
          view.byteLength - offset,
        );
        return new Reader(new StandardTypeReader(buffer));
      }),
    );
  }
  for (const type of definitions) {
    const fields = typeFields.get(type)!;
    const messageClass = classes.get(type)!;
    for (const field of type.definitions) {
      if (field.isConstant !== true) {
        fields.push(createLazyField(field, classes, definitions));
      }
    }
    for (let index = 0; index < fields.length; index++) {
      Object.defineProperty(messageClass.prototype, fields[index]!.name, {
        configurable: true,
        enumerable: false,
        get(this: never) {
          return messageClass.readField(this, index);
        },
      });
    }
  }
  const plan = {
    root: definitions.indexOf(rootType),
    types: definitions.map((type) => ({
      name: type.name,
      fields: type.definitions
        .filter((field) => field.isConstant !== true)
        .map((field) => ({
          name: field.name,
          type:
            field.isComplex === true
              ? resolveMessageDefinition(definitions, field.type).name
              : field.type,
          isComplex: field.isComplex === true,
          isArray: field.isArray === true,
          arrayLength: field.arrayLength,
        })),
    })),
  };
  const source = JSON.stringify(plan, undefined, 2);
  const root = classes.get(rootType)!;
  return { build: root.build, size: root.size, source: () => source };
}
