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

function sourceString(value: string): string {
  return JSON.stringify(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function arrayLengthSource(field: MessageDefinitionField): string {
  const { arrayLength } = field;
  if (arrayLength == undefined) {
    return "undefined";
  }
  if (!Number.isSafeInteger(arrayLength) || arrayLength < 0) {
    throw new Error(`Invalid array length ${String(arrayLength)} for field '${field.name}'`);
  }
  return String(arrayLength);
}

function fieldSizeFunctionName(fieldIndex: number): string {
  return `__field${fieldIndex}$size`;
}

function fieldOffsetFunctionName(fieldIndex: number): string {
  return `__field${fieldIndex}$offset`;
}

function fieldOffsetCacheName(fieldIndex: number): string {
  return `#_field${fieldIndex}_offset_cache`;
}

interface SerializedMessageReader {
  build: (view: DataView, offset?: number) => unknown;
  size: (view: DataView, offset?: number) => number;
  source: () => string;
}

// Return a static size function for our @param field
function sizeFunction(field: MessageDefinitionField, fieldIndex: number): string {
  if (field.isConstant === true) {
    return "";
  }

  const fieldSize = fixedSizeTypes.get(field.type as FixedSizeTypes);
  const sizeFunctionName = fieldSizeFunctionName(fieldIndex);

  // if the field size is not known, size will be calculated on-demand
  if (fieldSize == undefined) {
    // the size function for the field to use in calculating the size on-demand
    const fieldSizeFn =
      field.type === "string" ? "builtinSizes.string" : `${sanitizeName(field.type)}.size`;

    if (field.isArray === true) {
      if (field.arrayLength != undefined) {
        return `
          static ${sizeFunctionName}(view /* dataview */, offset) {
              return builtinSizes.fixedArray(view, offset, ${arrayLengthSource(field)}, ${fieldSizeFn});
          }`;
      } else {
        return `
          static ${sizeFunctionName}(view /* dataview */, offset) {
              return builtinSizes.array(view, offset, ${fieldSizeFn});
          }`;
      }
    }

    return `
      static ${sizeFunctionName}(view /* dataview */, offset) {
          return ${fieldSizeFn}(view, offset);
      }`;
  } else {
    if (field.isArray === true) {
      if (field.arrayLength != undefined) {
        return `
          static ${sizeFunctionName}(view /* dataview */, offset) {
            return ${fieldSize} * ${arrayLengthSource(field)};
          }`;
      } else {
        return `
          static ${sizeFunctionName}(view /* dataview */, offset) {
            const len = view.getUint32(offset, true);
            return 4 + len * ${fieldSize};
          }`;
      }
    }

    return `
      static ${sizeFunctionName}(view /* dataview */, offset) {
          return ${fieldSize};
      }`;
  }
}

// Return the part of the static size() function for our message class for @param field
function sizePartForDefinition(
  className: string,
  field: MessageDefinitionField,
  fieldIndex: number,
): string {
  if (field.isConstant === true) {
    return "";
  }

  const fieldSize = fixedSizeTypes.get(field.type as FixedSizeTypes);
  const isFixedArray = field.isArray === true && field.arrayLength != undefined;

  if (fieldSize != undefined && (isFixedArray || field.isArray === false)) {
    if (field.arrayLength != undefined) {
      const totalSize = fieldSize * Number(arrayLengthSource(field));
      return `
        totalSize += ${totalSize};
        offset += ${totalSize};
      `;
    } else {
      return `
        totalSize += ${fieldSize};
        offset += ${fieldSize};
      `;
    }
  }

  return `
    {
        const size = ${className}.${fieldSizeFunctionName(fieldIndex)}(view, offset);
        totalSize += size;
        offset += size;
    }
    `;
}

// Create a getter function for the field
function getterFunction(field: MessageDefinitionField, fieldIndex: number): string {
  if (field.isConstant === true) {
    return "";
  }

  if (field.name === "constructor") {
    throw new Error("LazyMessageReader does not support a field named 'constructor'");
  }

  const isBuiltinReader = hasOwn(deserializers, field.type);
  const isBuiltinSize = hasOwn(builtinSizes, field.type);

  // function to return a read array item
  const readerFn = isBuiltinReader
    ? `deserializers[${sourceString(field.type)}]`
    : `${sanitizeName(field.type)}.build`;

  // function to return size of individual array item
  const sizeFn = isBuiltinSize
    ? `builtinSizes[${sourceString(field.type)}]`
    : `${sanitizeName(field.type)}.size`;

  const fieldSize = fixedSizeTypes.get(field.type as FixedSizeTypes);
  const fieldName = sourceString(field.name);
  const offsetFunctionName = fieldOffsetFunctionName(fieldIndex);

  if (field.isArray === true) {
    const arrLen = field.arrayLength;
    if (arrLen != undefined) {
      // total size is known, which means we should use a builtin array reader
      if (fieldSize != undefined) {
        return `
          get ${fieldName}() {
            const offset = this.${offsetFunctionName}(this.#view, this.#offset);
            return deserializers[${sourceString(`${field.type}Array`)}](this.#view, offset, ${arrayLengthSource(field)});
          }`;
      } else {
        // fixed size array of complex size items
        return `
          get ${fieldName}() {
            const offset = this.${offsetFunctionName}(this.#view, this.#offset);
            return deserializers.fixedArray(this.#view, offset, ${arrayLengthSource(field)}, ${readerFn}, ${sizeFn});
          }`;
      }
    } else {
      // total size is known, which means we should use a builtin array reader
      if (fieldSize != undefined) {
        return `
          get ${fieldName}() {
            const offset = this.${offsetFunctionName}(this.#view, this.#offset);
            const len = this.#view.getUint32(offset, true);
            return deserializers[${sourceString(`${field.type}Array`)}](this.#view, offset + 4, len);
          }`;
      } else {
        return `
          get ${fieldName}() {
            const offset = this.${offsetFunctionName}(this.#view, this.#offset);
            return deserializers.dynamicArray(this.#view, offset, ${readerFn}, ${sizeFn});
          }`;
      }
    }
  } else {
    return `get ${fieldName}() {
        const offset = this.${offsetFunctionName}(this.#view, this.#offset);
        return ${readerFn}(this.#view, offset);
      }`;
  }
}

// Create a SerializedMessageReader
//
// The output is a set of classes - one for each custom message type. Only the root message
// class is exposed.
//
// Each LazyMessage class consists of static _size_ functions, _offset_ methods, and property _getters.
// The size functions calculate the size of fields within arrays.
// The offset methods calculate the start byte of the field within the entire message buffer.
// The getter de-serializes the field from the message buffer.
export default function buildReader(
  definitions: readonly MessageDefinition[],
): SerializedMessageReader {
  const classes = new Array<string>();
  const rootClassName = "__RootMsg";

  for (const type of definitions) {
    const name = sanitizeName(type.name ?? rootClassName);

    const offsetFns = new Array<string>();
    const initializers = new Array<string>();

    // getters need to "look back" at the previous field to create the offset function calls
    let prevField: { index: number } | undefined;

    for (const [fieldIndex, field] of type.definitions.entries()) {
      // constants have no impact on deserialization
      if (field.isConstant === true) {
        continue;
      }

      // offsets tell you where the raw data of your field starts (including any length bytes)
      // they are the size of the offset of the previous field + size of previous field
      // the first first field is at offset 0
      if (prevField == undefined) {
        offsetFns.push(`
          ${fieldOffsetFunctionName(fieldIndex)}(view, initOffset) {
            return initOffset;
          }`);
      } else {
        // offsets tell you where the raw data of your field starts (including any length bytes)
        // they are the size of the offset of the previous field + size of previous field
        const cacheName = fieldOffsetCacheName(fieldIndex);
        offsetFns.push(`
          ${fieldOffsetFunctionName(fieldIndex)}(view, initOffset) {
            if (this.${cacheName}) {
              return this.${cacheName};
            }
            const prevOffset = this.${fieldOffsetFunctionName(prevField.index)}(view, initOffset);
            const totalOffset = prevOffset + ${name}.${fieldSizeFunctionName(prevField.index)}(view, prevOffset);
            this.${cacheName} = totalOffset;
            return totalOffset;
          }`);
        initializers.push(`${cacheName} = undefined;`);
      }

      prevField = { index: fieldIndex };
    }

    const messageSrc = `class ${name} {
        ${type.definitions.map(sizeFunction).join("\n")}

        // return the total serialized size of the message in the view
        static size(view /* DataView */, initOffset = 0) {
          let totalSize = 0;
          let offset = initOffset;

          ${type.definitions.map(sizePartForDefinition.bind(undefined, name)).join("\n")}

          return totalSize;
        }

        ${offsetFns.join("\n")}

        // return an instance of ${name} from the view at initOffset bytes into the view
        // NOTE: the underlying view data lifetime must be at least the lifetime of the instance
        static build(view /* DataView */, offset = 0) {
          return new ${name}(view, offset);
        }

        #view = undefined;
        #offset;
        ${initializers.join("\n")}
  
        constructor(view, offset = 0) {
          this.#view = view;
          this.#offset = offset;
        }

        // return a json object of the fields
        // This fully deserializes all fields of the message into native types
        // Typed arrays are considered native types and remain as typed arrays
        toJSON() {
          const view = this.#view;
          const buffer = new Uint8Array(view.buffer, view.byteOffset + this.#offset, view.byteLength - this.#offset);
          const reader = new StandardTypeReader(buffer);
          return new (typeReaders.get(${JSON.stringify(type.name ?? rootClassName)}))(reader);
        }

        // return a plain javascript object of the message
        // This fully deserializes all fields of the message into native types
        // Typed arrays are considered native types and remain as typed arrays
        toObject() {
          const view = this.#view;
          const buffer = new Uint8Array(view.buffer, view.byteOffset + this.#offset, view.byteLength - this.#offset);
          const reader = new StandardTypeReader(buffer);
          return new (typeReaders.get(${JSON.stringify(type.name ?? rootClassName)}))(reader);
        }

        ${type.definitions.map(getterFunction).join("\n")}
    }`;

    classes.push(messageSrc);
  }

  // Output the types in reverse order so the root message appears last
  // Since the root message depends on custom types we want those to be defined
  const src = classes.reverse().join("\n\n");

  const typeReaders = createParsers({ definitions, topLevelReaderKey: rootClassName });

  // close over our builtin deserializers and builtin size functions
  // eslint-disable-next-line @typescript-eslint/no-implied-eval,no-new-func
  const wrapFn = new Function(
    "deserializers",
    "builtinSizes",
    "typeReaders",
    "StandardTypeReader",
    `${src}\nreturn __RootMsg;`,
  );
  const rootMsg = wrapFn.call(
    undefined,
    deserializers,
    builtinSizes,
    typeReaders,
    StandardTypeReader,
  ) as SerializedMessageReader;
  rootMsg.source = () => wrapFn.toString();
  return rootMsg;
}
