import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { createParsers, StandardTypeReader } from ".";
import { deserializers, fixedSizeTypes, FixedSizeTypes } from "./BuiltinDeserialize";

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

function sanitizeName(name: string): string {
  return name.replace(/^[0-9]|[^a-zA-Z0-9_]/g, "_");
}

interface SerializedMessageReader {
  build: (view: DataView, offset?: number) => unknown;
  size: (view: DataView, offset?: number) => number;
  source: () => string;
}

type ViewReader = (view: DataView, offset: number) => unknown;
type ViewSize = (view: DataView, offset: number) => number;
type ArrayReader = (view: DataView, offset: number, len: number) => unknown;

type LazyField = {
  name: string;
  // byte size of the field's serialized data, including any array length prefix
  size: ViewSize;
  read: ViewReader;
};

type LazyMessageClass = {
  size: (view: DataView, offset?: number) => number;
  build: (view: DataView, offset?: number) => unknown;
};

const fixedSizeArrayReaders = new Map<string, ArrayReader>(
  [...fixedSizeTypes.keys()].map((type) => [
    type,
    deserializers[`${type}Array` as const] as ArrayReader,
  ]),
);

function readJson(view: DataView, offset: number): unknown {
  const text = deserializers.string(view, offset);
  try {
    return JSON.parse(text);
  } catch {
    return `Could not parse ${text}`;
  }
}

function createLazyField(
  field: MessageDefinitionField,
  resolveClass: (typeName: string) => LazyMessageClass,
): LazyField {
  const fieldSize = fixedSizeTypes.get(field.type as FixedSizeTypes);
  const arrayLength = field.arrayLength;

  if (fieldSize != undefined) {
    const readArray = fixedSizeArrayReaders.get(field.type)!;
    if (field.isArray !== true) {
      return {
        name: field.name,
        size: () => fieldSize,
        read: deserializers[field.type as FixedSizeTypes] as ViewReader,
      };
    }
    if (arrayLength != undefined) {
      return {
        name: field.name,
        size: () => fieldSize * arrayLength,
        read: (view, offset) => readArray(view, offset, arrayLength),
      };
    }
    return {
      name: field.name,
      size: (view, offset) => 4 + view.getUint32(offset, true) * fieldSize,
      read: (view, offset) => readArray(view, offset + 4, view.getUint32(offset, true)),
    };
  }

  let readElement: ViewReader;
  let elementSize: ViewSize;
  if (field.type === "string") {
    readElement = deserializers.string;
    elementSize = builtinSizes.string;
  } else if (field.type === "json") {
    readElement = readJson;
    elementSize = builtinSizes.string;
  } else {
    // Any other type is a message type, whether or not the field sets isComplex
    readElement = (view, offset) => resolveClass(field.type).build(view, offset);
    elementSize = (view, offset) => resolveClass(field.type).size(view, offset);
  }

  if (field.isArray !== true) {
    return { name: field.name, size: elementSize, read: readElement };
  }
  if (arrayLength != undefined) {
    return {
      name: field.name,
      size: (view, offset) => builtinSizes.fixedArray(view, offset, arrayLength, elementSize),
      read: (view, offset) =>
        deserializers.fixedArray(view, offset, arrayLength, readElement, elementSize),
    };
  }
  return {
    name: field.name,
    size: (view, offset) => builtinSizes.array(view, offset, elementSize),
    read: (view, offset) => deserializers.dynamicArray(view, offset, readElement, elementSize),
  };
}

// Create the class for one message type. Instances hold a view and an offset, and each field is
// a prototype getter that deserializes the field from the view on access.
function createLazyMessageClass(
  fields: readonly LazyField[],
  toObject: (view: DataView, offset: number) => unknown,
): LazyMessageClass {
  class LazyMessage {
    readonly #view: DataView;
    readonly #offset: number;
    // start offsets of fields after the first, filled in as fields are accessed
    #fieldOffsets: (number | undefined)[] | undefined;

    constructor(view: DataView, offset = 0) {
      this.#view = view;
      this.#offset = offset;
    }

    // return the total serialized size of the message in the view
    static size(view: DataView, initOffset = 0): number {
      let offset = initOffset;
      for (const field of fields) {
        offset += field.size(view, offset);
      }
      return offset - initOffset;
    }

    // return an instance from the view at offset bytes into the view
    // NOTE: the underlying view data lifetime must be at least the lifetime of the instance
    static build(view: DataView, offset = 0): LazyMessage {
      return new LazyMessage(view, offset);
    }

    static readField(message: LazyMessage, index: number): unknown {
      return fields[index]!.read(message.#view, LazyMessage.#fieldOffset(message, index));
    }

    static #fieldOffset(message: LazyMessage, index: number): number {
      if (index === 0) {
        return message.#offset;
      }
      const offsets = (message.#fieldOffsets ??= []);
      let known = index;
      while (known > 0 && offsets[known] == undefined) {
        known--;
      }
      let offset = known === 0 ? message.#offset : offsets[known]!;
      for (let i = known; i < index; i++) {
        offset += fields[i]!.size(message.#view, offset);
        offsets[i + 1] = offset;
      }
      return offset;
    }

    // return a json object of the fields
    // This fully deserializes all fields of the message into native types
    // Typed arrays are considered native types and remain as typed arrays
    toJSON(): unknown {
      return toObject(this.#view, this.#offset);
    }

    // return a plain javascript object of the message
    // This fully deserializes all fields of the message into native types
    // Typed arrays are considered native types and remain as typed arrays
    toObject(): unknown {
      return toObject(this.#view, this.#offset);
    }
  }

  fields.forEach((field, index) => {
    Object.defineProperty(LazyMessage.prototype, field.name, {
      configurable: true,
      enumerable: false,
      get(this: LazyMessage) {
        return LazyMessage.readField(this, index);
      },
    });
  });

  return LazyMessage;
}

// Create a SerializedMessageReader
//
// Each message type gets a class with static _size_ and _build_ functions and a property getter
// for each field. The size function calculates the serialized size of a message in a view, and
// the getters deserialize fields from the view on access.
export default function buildReader(
  definitions: readonly MessageDefinition[],
): SerializedMessageReader {
  const rootClassName = "__RootMsg";
  const typeReaders = createParsers({ definitions, topLevelReaderKey: rootClassName });

  // Complex field types are resolved by name when a field is first read, so a type can refer to
  // types that appear later in the definition list.
  const classes = new Map<string, LazyMessageClass>();
  const resolveClass = (typeName: string): LazyMessageClass => {
    const lazyClass = classes.get(sanitizeName(typeName));
    if (lazyClass == undefined) {
      throw new Error(`No message definition found for type '${typeName}'`);
    }
    return lazyClass;
  };

  for (const type of definitions) {
    const key = sanitizeName(type.name ?? rootClassName);
    if (classes.has(key)) {
      throw new Error(`Duplicate message definition for type '${type.name ?? rootClassName}'`);
    }

    const fields = type.definitions
      .filter((field) => field.isConstant !== true)
      .map((field) => createLazyField(field, resolveClass));

    const TypeReader = typeReaders.get(type.name ?? rootClassName);
    const toObject = (view: DataView, offset: number) => {
      if (TypeReader == undefined) {
        throw new Error(`No reader for type '${type.name ?? rootClassName}'`);
      }
      const buffer = new Uint8Array(view.buffer, view.byteOffset + offset, view.byteLength - offset);
      return new TypeReader(new StandardTypeReader(buffer));
    };

    classes.set(key, createLazyMessageClass(fields, toObject));
  }

  const rootUnnamedType = definitions.find((type) => type.name == undefined) ?? definitions[0];
  const rootClass = resolveClass(rootUnnamedType?.name ?? rootClassName);
  return {
    build: (view, offset) => rootClass.build(view, offset),
    size: (view, offset) => rootClass.size(view, offset),
    source: () => "",
  };
}
