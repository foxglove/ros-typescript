import { parse } from "@foxglove/rosmsg";
import { readFile, readdir } from "fs/promises";
import { join, sep, resolve } from "path";

type TypeInformation = {
  fullType: string;
  complexTypes: string[];
  msgDefinitionString: string;
};

/**
 * Generates a flattened ROS 2 message definition that includes the target message
 * and all transitive complex-type dependencies.
 *
 * The output is a single string containing the primary message definition followed by
 * dependent definitions, separated by a delimiter and an "MSG: <package/type>" header
 * for each dependency (similar to `rosmsg show --raw`).
 *
 * @param msgdefsRoot Path to the root directory containing package folders with .msg files.
 * @param msgFile Path to the specific .msg file under `msgdefsRoot` to resolve (absolute or relative).
 * @returns Concatenated message definitions for the target type and its dependencies.
 */
export async function generateMsgDeps(msgdefsRoot: string, msgFile: string): Promise<string> {
  const rootPath = resolve(msgdefsRoot);
  const filename = resolve(msgFile);
  const fullTypeName = getFullTypeFromFilename(filename, rootPath);

  const initial = await loadType(fullTypeName, rootPath, getPackageName(fullTypeName));
  let output = "";
  output += initial.msgDefinitionString;

  const complexTypes = initial.complexTypes.slice();
  const seenTypes = new Set<string>();
  seenTypes.add(initial.fullType);

  while (complexTypes.length > 0) {
    const complexType = complexTypes.shift()!;
    const curRes = await loadType(complexType, rootPath, getPackageName(complexType));

    output +=
      `\n================================================================================\n` +
      `MSG: ${curRes.fullType}\n` +
      curRes.msgDefinitionString;

    for (const complexSubType of curRes.complexTypes) {
      if (!seenTypes.has(complexSubType)) {
        complexTypes.push(complexSubType);
        seenTypes.add(complexSubType);
      }
    }
  }

  return output;
}
function getFullType(typeName: string, currentPackage: string | undefined): string {
  if (typeName.includes("/")) {
    return typeName;
  }
  if (!currentPackage) {
    throw new Error(`Cannot resolve relative type name ${typeName}`);
  }
  return `${currentPackage}/${typeName}`;
}

function getPackageName(typeName: string): string {
  return typeName.split("/")[0]!;
}

function getBaseType(typeName: string): string {
  return typeName.split("/").pop()!;
}

async function loadType(
  typeName: string,
  rootPath: string,
  currentPackage: string,
): Promise<TypeInformation> {
  const fullType = getFullType(typeName, currentPackage);
  const packageName = getPackageName(fullType);
  const baseType = getBaseType(typeName);
  const msgDefinitionString = await readFileFromBaseDir(
    `${baseType}.msg`,
    join(rootPath, packageName),
  );
  if (msgDefinitionString == undefined) {
    throw new Error(
      `Failed to load definition for type ${typeName} (current package: ${currentPackage})`,
    );
  }

  const complexTypes: string[] = [];
  const msgDefinitions = parse(msgDefinitionString, { ros2: true, skipTypeFixup: true });
  // Ensure first definition is named with the full type for proper namespace resolution
  if (msgDefinitions[0] && msgDefinitions[0].name == undefined) {
    msgDefinitions[0].name = fullType;
  }
  for (const msgdef of msgDefinitions) {
    const containerPackage = msgdef.name ? getPackageName(msgdef.name) : currentPackage;
    for (const definition of msgdef.definitions) {
      if (definition.isComplex === true && !complexTypes.includes(definition.type)) {
        complexTypes.push(getFullType(definition.type, containerPackage));
      }
    }
  }

  return { fullType, complexTypes, msgDefinitionString };
}

function getFullTypeFromFilename(filename: string, rootPath: string): string {
  const pathParts = rootPath.split(sep);
  const filenameParts = filename.replace(/\.msg$/, "").split(sep);

  // Remove pathParts from msgFileParts
  for (const pathPart of pathParts) {
    if (pathPart !== filenameParts[0]) {
      console.log(`${pathPart} !== ${filenameParts[0]!}`);
      throw new Error(`<msg-file> "${filename}" must be under <msgdefs-dir> "${rootPath}"`);
    }
    filenameParts.shift();
  }

  const packageName = filenameParts.shift()!;
  const baseType = filenameParts[filenameParts.length - 1]!;
  return `${packageName}/${baseType}`;
}

// Recursively search inside a directory for a file with a given name
async function readFileFromBaseDir(filename: string, baseDir: string): Promise<string | undefined> {
  const files = await readdir(baseDir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      const contents = await readFileFromBaseDir(filename, join(baseDir, file.name));
      if (contents != undefined) {
        return contents;
      }
    } else if (file.isFile() && file.name === filename) {
      return await readFile(join(baseDir, file.name), { encoding: "utf8" });
    }
  }
  return undefined;
}
