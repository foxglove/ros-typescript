import type { MessageDefinition } from "@foxglove/message-definition";

const ROS_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
// Named types and complex field types are interpolated into generated code after replacing "/"
// with "_", so they must reduce to a single identifier.
const ROS_TYPE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_/]*$/;

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
      `Invalid message definition type name: '${type}' is not a valid ROS primitive type name (set isComplex for message types)`,
    );
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
  for (const type of definitions) {
    if (type.name != undefined && type.name !== "") {
      assertValidRosTypeName(type.name);
    }
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }

      assertValidRosFieldName(field.name);
      if (field.isComplex === true) {
        assertValidRosTypeName(field.type);
      } else {
        assertValidRosPrimitiveTypeName(field.type);
      }
      assertValidArrayLength(field.arrayLength);
    }
  }
}
