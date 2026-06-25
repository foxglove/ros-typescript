import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

const unsafePropertyNames = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeName(name: string): string {
  const sanitized = name.replace(/^[0-9]|[^a-zA-Z0-9_]/g, "_");
  if (sanitized.length === 0) {
    return "_";
  }
  return unsafePropertyNames.has(sanitized) ? `_${sanitized}` : sanitized;
}

function sanitizeField(field: MessageDefinitionField): MessageDefinitionField {
  if (field.isConstant === true) {
    return field;
  }

  const fieldName = field.name;
  const sanitizedName = sanitizeName(fieldName);
  return sanitizedName === fieldName ? field : { ...field, name: sanitizedName };
}

export function sanitizeMessageDefinitionFields(
  definitions: readonly MessageDefinition[],
): MessageDefinition[] {
  return definitions.map((definition) => ({
    ...definition,
    definitions: definition.definitions.map(sanitizeField),
  }));
}
