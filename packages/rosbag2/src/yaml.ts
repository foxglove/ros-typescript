/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import yaml from "js-yaml";

// keep most of the original `int` options as is
const options = Object.assign({}, (yaml as any).types.int.options) as yaml.TypeConstructorOptions;

options.construct = (data: string) => {
  let value = data,
    sign = 1n,
    ch;

  if (value.includes("_")) {
    value = value.replace(/_/g, "");
  }

  ch = value[0];

  if (ch === "-" || ch === "+") {
    if (ch === "-") {
      sign = -1n;
    }
    value = value.slice(1);
    ch = value[0];
  }

  return sign * BigInt(value);
};

options.predicate = (object): boolean => {
  const isBigInt = Object.prototype.toString.call(object) === "[object BigInt]";
  return isBigInt || ((yaml as any).types.int.options.predicate(object) as boolean);
};

const BigIntType = new yaml.Type("tag:yaml.org,2002:int", options);

const SCHEMA = yaml.DEFAULT_SCHEMA.extend({ implicit: [BigIntType] });

/**
 * Parse a YAML string, parsing any integers as BigInts.
 * @param yamlString A YAML string to parse
 * @returns Parsed YAML
 */
export function parseYaml(yamlString: string): unknown {
  return yaml.load(yamlString, { schema: SCHEMA });
}
