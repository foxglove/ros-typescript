import type { MessageDefinition } from "@foxglove/message-definition";

const ROS_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
// Type names and field types are interpolated into generated code after replacing "/" with "_",
// so they must reduce to a single identifier.
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
      assertValidRosTypeName(field.type);
      assertValidArrayLength(field.arrayLength);
    }
  }
}
