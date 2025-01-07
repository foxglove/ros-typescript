import { MessageDefinitionField } from "@foxglove/message-definition";

export function messageDefinitionHasDataFields(fields: MessageDefinitionField[]): boolean {
  return fields.some((field) => field.isConstant !== true);
}
