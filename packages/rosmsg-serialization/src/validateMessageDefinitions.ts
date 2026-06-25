import type { MessageDefinition } from "@foxglove/message-definition";

const ROS_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function assertValidRosFieldName(name: string): void {
  if (!ROS_FIELD_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid message definition field name: '${name}' is not a valid ROS field name`,
    );
  }
}

export function validateMessageDefinitionsForCodegen(
  definitions: readonly MessageDefinition[],
): void {
  for (const type of definitions) {
    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }

      assertValidRosFieldName(field.name);
    }
  }
}
