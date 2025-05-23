import { MessageDefinition } from "@foxglove/message-definition";
import { parse, ParseOptions } from "@foxglove/rosmsg";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join, basename, sep } from "path";
import { format, Options } from "prettier";

const LICENSE = `// This Source Code Form is subject to the terms of the MIT
// License. If a copy of the MIT license was not distributed with this
// file, You can obtain one at https://opensource.org/license/mit/`;

const PRETTIER_OPTS: Options = {
  parser: "babel",
  arrowParens: "always",
  printWidth: 100,
  trailingComma: "all",
  tabWidth: 2,
  semi: true,
};

async function main() {
  const msgdefsRos1Path = join(__dirname, "..", "msgdefs", "ros1");
  const msgdefsRos2GalacticPath = join(__dirname, "..", "msgdefs", "ros2galactic");
  const msgdefsRos2HumblePath = join(__dirname, "..", "msgdefs", "ros2humble");
  const msgdefsRos2IronPath = join(__dirname, "..", "msgdefs", "ros2iron");
  const msgdefsRos2JazzyPath = join(__dirname, "..", "msgdefs", "ros2jazzy");
  const distDir = join(__dirname, "..", "dist");
  const libFile = join(distDir, "index.js");
  const esmFile = join(distDir, "index.esm.js");
  const declFile = join(distDir, "index.d.ts");
  const definitionsByGroup = new Map<string, Record<string, MessageDefinition>>([
    ["ros1", {}],
    ["ros2galactic", {}],
    ["ros2humble", {}],
    ["ros2iron", {}],
    ["ros2jazzy", {}],
  ]);

  await loadDefinitions(msgdefsRos1Path, definitionsByGroup.get("ros1")!, {});
  await loadDefinitions(msgdefsRos2GalacticPath, definitionsByGroup.get("ros2galactic")!, {
    ros2: true,
  });
  await loadDefinitions(msgdefsRos2HumblePath, definitionsByGroup.get("ros2humble")!, {
    ros2: true,
  });
  await loadDefinitions(msgdefsRos2IronPath, definitionsByGroup.get("ros2iron")!, {
    ros2: true,
  });
  await loadDefinitions(msgdefsRos2JazzyPath, definitionsByGroup.get("ros2jazzy")!, {
    ros2: true,
  });

  const libOutput = await generateCjsLibrary(definitionsByGroup);
  const esmOutput = await generateEsmLibrary(definitionsByGroup);
  const declOutput = generateDefinitions(definitionsByGroup);

  await mkdir(distDir, { recursive: true });
  await writeFile(libFile, libOutput);
  await writeFile(esmFile, esmOutput);
  await writeFile(declFile, declOutput);
}

async function getMsgFiles(dir: string): Promise<string[]> {
  let output: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      output = output.concat(await getMsgFiles(join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".msg")) {
      output.push(join(dir, entry.name));
    }
  }
  return output;
}

async function loadDefinitions(
  msgdefsPath: string,
  definitions: Record<string, MessageDefinition>,
  parseOptions: ParseOptions,
): Promise<void> {
  const msgFiles = await getMsgFiles(msgdefsPath);
  for (const filename of msgFiles) {
    const dataType = filenameToDataType(filename);
    const typeName = dataTypeToTypeName(dataType);
    const msgdef = await readFile(filename, { encoding: "utf8" });
    const schema = parse(msgdef, parseOptions);
    schema[0]!.name = typeName;
    for (const entry of schema) {
      if (entry.name == undefined) {
        throw new Error(`Failed to parse ${dataType} from ${filename}`);
      }
      definitions[entry.name] = entry;
    }
  }
}

function filenameToDataType(filename: string): string {
  const parts = filename.split(sep);
  const newParts: string[] = [];
  const baseTypeName = basename(parts.pop()!, ".msg");
  while (parts.length > 0) {
    const part = parts.pop()!;
    newParts.unshift(part);
    if (part !== "msg") {
      break;
    }
  }
  return `${newParts.join("/")}/${baseTypeName}`;
}

function dataTypeToTypeName(dataType: string): string {
  const parts = dataType.split("/");
  if (parts.length < 2) {
    throw new Error(`Invalid data type: ${dataType}`);
  }
  const pkg = parts[0]!;
  if (pkg === "msg") {
    throw new Error(`dataType=${dataType}`);
  }
  const name = parts[parts.length - 1]!;
  return `${pkg}/${name}`;
}

function stringifyDefinitions(definitions: Record<string, MessageDefinition>) {
  // JSON.stringify cannot handle bigints, so we output them first as a string of the scheme "BIGINT(number)"
  // and then replace that string with the actual bigint instance (e.g. 0n).
  const bigintRegex = /"BIGINT\(-?\d+\)"/gm;
  const stringifyBigint = (val: bigint) => `BIGINT(${val.toString()})`;
  const bigintFromString = (str: string) => str.slice('"BIGINT('.length, str.length - 2) + "n";

  // Output bigints as strings with a trailing `n`.
  const replacer = (_key: string, value: unknown) => {
    return typeof value === "bigint" ? stringifyBigint(value) : value;
  };

  // Stringify definitions and re-convert stringified bigints to a bigint instance.
  return JSON.stringify(definitions, replacer).replace(bigintRegex, bigintFromString);
}

async function generateCjsLibrary(
  definitionsByGroup: Map<string, Record<string, MessageDefinition>>,
): Promise<string> {
  let lib = `${LICENSE}\n`;
  for (const [groupName, definitions] of definitionsByGroup.entries()) {
    lib += `
const ${groupName}Definitions = ${stringifyDefinitions(definitions)}
module.exports.${groupName} = ${groupName}Definitions
`;
  }
  return await format(lib, PRETTIER_OPTS);
}

async function generateEsmLibrary(
  definitionsByGroup: Map<string, Record<string, MessageDefinition>>,
): Promise<string> {
  let lib = `${LICENSE}\n`;
  for (const [groupName, definitions] of definitionsByGroup.entries()) {
    lib += `
const ${groupName}Definitions = ${stringifyDefinitions(definitions)}
export { ${groupName}Definitions as ${groupName} }
`;
  }
  lib += `export default { ${[...definitionsByGroup.keys()]
    .map((groupName) => `${groupName}: ${groupName}Definitions`)
    .join(", ")} }`;

  return await format(lib, PRETTIER_OPTS);
}

function generateDefinitions(
  definitionsByGroup: Map<string, Record<string, MessageDefinition>>,
): string {
  let output = `${LICENSE}

import { MessageDefinition } from "@foxglove/message-definition";
`;

  for (const [groupName, definitions] of definitionsByGroup.entries()) {
    const entries = Object.keys(definitions)
      .sort()
      .map((key) => `  "${key}": MessageDefinition;`)
      .join("\n");
    output += `
export type ${exportedTypeName(groupName)} = {
${entries}
};
`;
  }

  output += `\n`;
  const groupExportTypes = [...definitionsByGroup.keys()].map(
    (groupName) => `${groupName}: ${exportedTypeName(groupName)}`,
  );

  output += groupExportTypes.map((exportType) => `declare const ${exportType};\n`).join("");
  output += `export { ${[...definitionsByGroup.keys()].join(", ")} };\n`;

  output += `declare const _default: {
  ${groupExportTypes.join(",\n  ")}
}`;
  output += `\nexport default _default;\n`;
  return output;
}

function exportedTypeName(groupName: string): string {
  // Uppercase the first letter of `groupName` and any letter following a number
  const camelCase = `${groupName[0]!.toUpperCase()}${groupName
    .slice(1)
    .replace(/([0-9])([a-z])/, (m) => m[0]! + m[1]!.toUpperCase())}`;
  return `${camelCase}MsgCommonDefinitions`;
}

void main();
