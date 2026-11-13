import type { MessageDefinition } from "@foxglove/message-definition";

import { resolveMessageDefinition } from "./resolveMessageDefinition";

const ROS_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const ROS_TYPE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_/]*$/;
const PRIMITIVE_TYPES = new Set([
  "bool",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "string",
  "time",
  "duration",
]);

function assertValidRosFieldName(name: string): void {
  if (!ROS_FIELD_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid message definition field name: '${name}' is not a valid ROS field name`,
    );
  }
}

function assertValidRosTypeName(name: string): void {
  if (!ROS_TYPE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid message definition type name: '${name}' is not a valid ROS type name`);
  }
}

// Generators interpolate non-complex field types verbatim, so they must be one identifier.
function assertValidRosPrimitiveTypeName(type: string): void {
  if (!ROS_FIELD_NAME_PATTERN.test(type)) {
    throw new Error(
      `Invalid message definition type name: '${type}' is not a valid ROS primitive type name`,
    );
  }
  if (!PRIMITIVE_TYPES.has(type)) {
    throw new Error(`Unsupported ROS primitive type '${type}'`);
  }
}

function assertValidArrayLength(arrayLength: number | undefined): void {
  if (arrayLength != undefined && (!Number.isSafeInteger(arrayLength) || arrayLength < 0)) {
    throw new Error(
      `Invalid message definition array length: '${String(arrayLength)}' is not a non-negative integer`,
    );
  }
}

export function validateMessageDefinitionsForCodegen(
  definitions: readonly MessageDefinition[],
): void {
  const names = new Set<string | undefined>();
  for (const type of definitions) {
    if (names.has(type.name)) {
      throw new Error(
        type.name == undefined ? "multiple unnamed types" : `Duplicate ROS type '${type.name}'`,
      );
    }
    names.add(type.name);
  }
  for (const type of definitions) {
    if (type.name != undefined) {
      assertValidRosTypeName(type.name);
    }
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }

      assertValidRosFieldName(field.name);
      if (field.isComplex === true) {
        assertValidRosTypeName(field.type);
        resolveMessageDefinition(definitions, field.type);
      } else {
        assertValidRosPrimitiveTypeName(field.type);
      }
      assertValidArrayLength(field.arrayLength);
    }
  }
}
