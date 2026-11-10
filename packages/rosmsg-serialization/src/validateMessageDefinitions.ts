import type { MessageDefinition } from "@foxglove/message-definition";

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
  "json",
]);

export function validateMessageDefinitionsForCodegen(
  definitions: readonly MessageDefinition[],
): void {
  for (const type of definitions) {
    if (type.name != undefined && !ROS_TYPE_NAME_PATTERN.test(type.name)) {
      throw new Error(
        `Invalid message definition type name: '${type.name}' is not a valid ROS type name`,
      );
    }
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }
      if (!ROS_FIELD_NAME_PATTERN.test(field.name)) {
        throw new Error(
          `Invalid message definition field name: '${field.name}' is not a valid ROS field name`,
        );
      }
      if (field.isComplex === true) {
        if (!ROS_TYPE_NAME_PATTERN.test(field.type)) {
          throw new Error(
            `Invalid message definition type name: '${field.type}' is not a valid ROS type name`,
          );
        }
      } else if (!ROS_FIELD_NAME_PATTERN.test(field.type)) {
        throw new Error(
          `Invalid message definition type name: '${field.type}' is not a valid ROS primitive type name`,
        );
      } else if (!PRIMITIVE_TYPES.has(field.type)) {
        throw new Error(`Unsupported ROS primitive type '${field.type}'`);
      }
      const { arrayLength } = field;
      if (arrayLength != undefined && (!Number.isSafeInteger(arrayLength) || arrayLength < 0)) {
        throw new Error(
          `Invalid message definition array length: '${String(arrayLength)}' is not a non-negative integer`,
        );
      }
    }
  }
}
