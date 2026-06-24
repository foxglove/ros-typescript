import type { MessageDefinition } from "@foxglove/message-definition";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][0-9A-Za-z_$]*$/;
const ROS_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\/[A-Za-z][A-Za-z0-9_]*)?$/;

const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const UNSAFE_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);

function friendlyName(name: string): string {
  return name.replace(/\//g, "_");
}

function assertSafeIdentifier(name: string, label: string): void {
  if (
    !IDENTIFIER_PATTERN.test(name) ||
    RESERVED_WORDS.has(name) ||
    UNSAFE_PROPERTY_NAMES.has(name)
  ) {
    throw new Error(`Invalid message definition ${label}: '${name}' is not a safe identifier`);
  }
}

function assertSafeRosTypeName(name: string, label: string): void {
  if (!ROS_TYPE_PATTERN.test(name)) {
    throw new Error(`Invalid message definition ${label}: '${name}' is not a safe ROS type name`);
  }
}

export function validateMessageDefinitionsForCodegen(
  definitions: readonly MessageDefinition[],
  options: { validateTypeNames?: boolean } = {},
): void {
  const validateTypeNames = options.validateTypeNames ?? false;
  for (const type of definitions) {
    if (validateTypeNames && type.name != undefined) {
      assertSafeRosTypeName(type.name, "type name");
      assertSafeIdentifier(friendlyName(type.name), "generated type name");
    }

    for (const field of type.definitions) {
      if (field.isConstant === true) {
        continue;
      }

      assertSafeIdentifier(field.name, "field name");
      assertSafeRosTypeName(field.type, "field type");
      if (field.isComplex !== true) {
        assertSafeIdentifier(field.type, "primitive field type");
      }

      if (
        field.arrayLength != undefined &&
        (!Number.isSafeInteger(field.arrayLength) || field.arrayLength < 0)
      ) {
        throw new Error(
          `Invalid message definition array length for field '${field.name}': ${String(
            field.arrayLength,
          )}`,
        );
      }
    }
  }
}
