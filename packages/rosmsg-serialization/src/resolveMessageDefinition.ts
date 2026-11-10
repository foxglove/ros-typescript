import type { MessageDefinition } from "@foxglove/message-definition";

export function resolveMessageDefinition(
  definitions: readonly MessageDefinition[],
  name: string,
): MessageDefinition {
  const exact = definitions.find((definition) => definition.name === name);
  if (exact != undefined) {
    return exact;
  }
  const matches = name.includes("/")
    ? []
    : definitions.filter((definition) => definition.name?.endsWith(`/${name}`) === true);
  if (matches.length !== 1) {
    throw new Error(
      `Expected 1 top level type definition for '${name}' but found ${matches.length}.`,
    );
  }
  return matches[0]!;
}
