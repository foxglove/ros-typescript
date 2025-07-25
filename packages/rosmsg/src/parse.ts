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

const ROS1_GRAMMAR = Grammar.fromCompiled(ros1Rules);

export type ParseOptions = {
  /** Parse message definitions as ROS 2. Otherwise, parse as ROS1 */
  ros2?: boolean;
  /**
   * Return the original type names used in the file, without normalizing to
   * fully qualified type names
   */
  skipTypeFixup?: boolean;
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
export function parse(messageDefinition: string, options: ParseOptions = {}): MessageDefinition[] {
  // read all the lines and remove empties
  const allLines = messageDefinition
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  let definitionLines: { line: string }[] = [];
  const types: MessageDefinition[] = [];
  // group lines into individual definitions
  allLines.forEach((line) => {
    // ignore comment lines
    if (line.startsWith("#")) {
      return;
    }

    // definitions are split by equal signs
    if (line.startsWith("==")) {
      types.push(
        options.ros2 === true
          ? buildRos2Type(definitionLines)
          : buildType(definitionLines, ROS1_GRAMMAR),
      );
      definitionLines = [];
    } else {
      definitionLines.push({ line });
    }
  });
  types.push(
    options.ros2 === true
      ? buildRos2Type(definitionLines)
      : buildType(definitionLines, ROS1_GRAMMAR),
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

  return uniqueTypes;
}

/**
 * Normalize type names of complex types to fully qualified type names.
 * Example: `Marker` (defined in `visualization_msgs/MarkerArray` message) becomes `visualization_msgs/Marker`.
 */
export function fixupTypes(types: MessageDefinition[]): void {
  types.forEach(({ definitions, name }) => {
    definitions.forEach((definition) => {
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
    });
  });
}

function buildType(lines: { line: string }[], grammar: Grammar): MessageDefinition {
  const definitions: MessageDefinitionField[] = [];
  let complexTypeName: string | undefined;
  lines.forEach(({ line }) => {
    if (line.startsWith("MSG:")) {
      const [_, name] = simpleTokenization(line);
      complexTypeName = name?.trim();
      return;
    }

    const parser = new Parser(grammar);
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
  });
  return { name: complexTypeName, definitions };
}

function simpleTokenization(line: string): string[] {
  return line
    .replace(/#.*/gi, "")
    .split(" ")
    .filter((word) => word);
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
