// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import {
  MessageDefinition,
  MessageDefinitionField,
  isMsgDefEqual,
} from "@foxglove/message-definition";
import { Grammar, Parser } from "nearley";

import { buildRos2Type } from "./buildRos2Type";
import ros1Rules from "./ros1.ne";
import { NamedMessageDefinition } from "./types";

const ROS1_GRAMMAR = Grammar.fromCompiled(ros1Rules);

export type ParseOptions = {
  /** The name for the message definition being parsed. */
  topLevelTypeName: string;
  /**
   * Parse message definitions as ROS 2. Otherwise, parse as ROS1
   * @default false
   */
  ros2?: boolean;
  /**
   * Return the original type names used in the file, without normalizing to
   * fully qualified type names
   * @default false
   */
  skipTypeFixup?: boolean;
  /**
   * Disable pseudo-definitions for auto-detected enums, based on matching constant
   * fields with non-constant fields.
   * @default false
   */
  skipEnums?: boolean;
};

// Given a raw message definition string, parse it into an object representation.
// Example return value:
// [{
//   name: undefined,
//   definitions: [
//     {
//       arrayLength: undefined,
//       isArray: false,
//       isComplex: false,
//       name: "name",
//       type: "string",
//       defaultValue: undefined
//     }, ...
//   ],
// }, ... ]
//
// See unit tests for more examples.
export function parse(messageDefinition: string, options: ParseOptions): NamedMessageDefinition[] {
  // read all the lines and remove empties
  const allLines = messageDefinition
    .split("\n")
    .map((line) => line.trim())
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    .filter((line) => line);

  let definitionLines: { line: string }[] = [];
  const types: NamedMessageDefinition[] = [];
  let isTopLevelType = true;

  // group lines into individual definitions
  for (const line of allLines) {
    // ignore comment lines
    if (line.startsWith("#")) {
      continue;
    }

    // definitions are split by equal signs
    if (line.startsWith("==")) {
      types.push(
        options.ros2 === true
          ? buildRos2Type(definitionLines, isTopLevelType ? options.topLevelTypeName : undefined)
          : buildRos1Type(definitionLines, isTopLevelType ? options.topLevelTypeName : undefined),
      );
      isTopLevelType = false;
      definitionLines = [];
    } else {
      definitionLines.push({ line });
    }
  }

  types.push(
    options.ros2 === true
      ? buildRos2Type(definitionLines, isTopLevelType ? options.topLevelTypeName : undefined)
      : buildRos1Type(definitionLines, isTopLevelType ? options.topLevelTypeName : undefined),
  );

  // Filter out duplicate types to handle the case where schemas are erroneously duplicated
  // e.g. caused by a bug in `mcap convert`. Removing duplicates here will avoid that searching
  // a type by name will return more than one result.
  const seenTypes: MessageDefinition[] = [];
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const uniqueTypes = types.filter((definition) => {
    return seenTypes.find((otherDefinition) => isMsgDefEqual(definition, otherDefinition))
      ? false
      : seenTypes.push(definition); // Always evaluates to true;
  });

  // Fix up complex type names
  if (options.skipTypeFixup !== true) {
    fixupTypes(uniqueTypes);
  }

  if (options.skipEnums !== true) {
    inferEnums(uniqueTypes);
  }

  return uniqueTypes;
}

/**
 * Normalize type names of complex types to fully qualified type names.
 * Example: `Marker` (defined in `visualization_msgs/MarkerArray` message) becomes `visualization_msgs/Marker`.
 */
export function fixupTypes(types: MessageDefinition[]): void {
  for (const { definitions, name } of types) {
    for (const definition of definitions) {
      if (definition.isComplex === true) {
        // The type might be under a namespace (e.g. std_msgs or std_msgs/msg) which is required
        // to uniquely retrieve the type by its name.
        const typeNamespace = name?.split("/").slice(0, -1).join("/");
        const foundName = findTypeByName(types, definition.type, typeNamespace).name;
        if (foundName == undefined) {
          throw new Error(`Missing type definition for ${definition.type}`);
        }
        definition.type = foundName;
      }
    }
  }
}

/**
 * @param topLevelTypeName Required if this is a top-level type that does not contain a "MSG:" line.
 */
function buildRos1Type(
  lines: { line: string }[],
  topLevelTypeName?: string,
): NamedMessageDefinition {
  const definitions: MessageDefinitionField[] = [];
  let complexTypeName = topLevelTypeName;
  for (const { line } of lines) {
    if (line.startsWith("MSG:")) {
      const [_, name] = simpleTokenization(line);
      if (complexTypeName != undefined) {
        throw new Error(
          `Unexpected MSG name in top-level type: ${complexTypeName}, ${name ?? "(could not parse name)"}`,
        );
      }
      complexTypeName = name?.trim();
      continue;
    }

    const parser = new Parser(ROS1_GRAMMAR);
    parser.feed(line);
    const results = parser.finish() as MessageDefinitionField[];
    if (results.length === 0) {
      throw new Error(`Could not parse line: '${line}'`);
    } else if (results.length > 1) {
      throw new Error(`Ambiguous line: '${line}'`);
    }
    const result = results[0];
    if (result != undefined) {
      result.type = normalizeType(result.type);
      definitions.push(result);
    }
  }
  if (complexTypeName == undefined) {
    throw new Error("Missing name for top-level type definition");
  }
  return { name: complexTypeName, definitions };
}

function simpleTokenization(line: string): string[] {
  return (
    line
      .replace(/#.*/gi, "")
      .split(" ")
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      .filter((word) => word)
  );
}

function findTypeByName(
  types: MessageDefinition[],
  name: string,
  typeNamespace?: string,
): MessageDefinition {
  const matches = types.filter((type) => {
    const typeName = type.name ?? "";
    // if the search is empty, return unnamed types
    if (name.length === 0) {
      return typeName.length === 0;
    }

    if (name.includes("/")) {
      // Fully-qualified name, match exact
      return typeName === name;
    } else if (name === "Header") {
      // Header is a special case, see http://wiki.ros.org/msg#Fields
      return typeName === `std_msgs/Header`;
    } else if (typeNamespace) {
      // Type namespace is given, create fully-qualified name and match exact
      return typeName === `${typeNamespace}/${name}`;
    } else {
      // Fallback, return if the search is in the type name
      return typeName.endsWith(`/${name}`);
    }
  });
  if (matches[0] == undefined) {
    throw new Error(
      `Expected 1 top level type definition for '${name}' but found ${matches.length}`,
    );
  }

  if (matches.length > 1) {
    throw new Error(`Cannot unambiguously determine fully-qualified type name for '${name}'`);
  }
  return matches[0];
}

export function normalizeType(type: string): string {
  // Normalize deprecated aliases
  if (type === "char") {
    return "uint8";
  } else if (type === "byte") {
    return "int8";
  }
  return type;
}

/**
 * Although ROS does not natively support enums, we can infer them by looking at constant fields in
 * the message definitions. We treat constants preceding a field with a matching type as though they
 * defined an enum for that field.
 */
function inferEnums(types: NamedMessageDefinition[]) {
  const existingTypeNames = new Set(types.map((type) => type.name));
  for (const { name: typeName, definitions } of types) {
    let currentConstants: MessageDefinitionField[] = [];
    let currentType: string | undefined;

    for (const field of definitions) {
      if (currentType != undefined && field.type !== currentType) {
        // encountering new type resets the accumulated constants
        currentConstants = [];
        currentType = undefined;
      }

      if (field.isConstant === true && field.value != undefined) {
        currentType = field.type;
        currentConstants.push(field);
        continue;
      }

      // otherwise assign accumulated constants for that field
      if (currentConstants.length > 0) {
        const enumName = `enum for ${typeName}.${field.name}`;
        if (existingTypeNames.has(enumName)) {
          throw new Error(`Unable to infer "${enumName}" due to existing type with this name`);
        }
        if (field.enumType != undefined) {
          throw new Error(`Invariant: expected field not to have an enumType yet`);
        }
        field.enumType = enumName;
        types.push({ name: enumName, definitions: currentConstants });
        existingTypeNames.add(enumName);
      }

      // and start over - reset constants
      currentConstants = [];
    }
  }
}
