import type { MessageDefinition } from "@foxglove/message-definition";

import { LazyMessageReader } from "./LazyMessageReader";
import { MessageReader } from "./MessageReader";
import { MessageWriter } from "./MessageWriter";

describe.each([MessageReader, LazyMessageReader, MessageWriter])(
  "%p schema validation",
  (Reader) => {
    it.each([
      "constructor",
      "valueOf",
      "toString",
      "hasOwnProperty",
      "typedArray",
      "fixedArray",
      "bogus",
    ])("rejects unsupported primitive %s", (type) => {
      const definitions: MessageDefinition[] = [{ definitions: [{ name: "data", type }] }];
      expect(() => new Reader(definitions)).toThrow(`Unsupported ROS primitive type '${type}'`);
    });

    it("rejects duplicate named definitions", () => {
      const definitions = [
        { definitions: [] },
        { name: "test/Value", definitions: [] },
        { name: "test/Value", definitions: [] },
      ];
      expect(() => new Reader(definitions)).toThrow("Duplicate ROS type 'test/Value'");
    });

    it("rejects unresolved complex types in unused definitions", () => {
      const definitions = [
        { definitions: [] },
        {
          name: "test/Unused",
          definitions: [{ name: "value", type: "test/Missing", isComplex: true }],
        },
      ];
      expect(() => new Reader(definitions)).toThrow(
        "Expected 1 top level type definition for 'test/Missing' but found 0",
      );
    });

    it("rejects ambiguous short type names", () => {
      const definitions = [
        { definitions: [{ name: "value", type: "Value", isComplex: true }] },
        { name: "first/Value", definitions: [] },
        { name: "second/Value", definitions: [] },
      ];
      expect(() => new Reader(definitions)).toThrow(
        "Expected 1 top level type definition for 'Value' but found 2",
      );
    });

    it("does not resolve a qualified name by suffix", () => {
      const definitions = [
        { definitions: [{ name: "value", type: "test/Value", isComplex: true }] },
        { name: "not_test/Value", definitions: [] },
      ];
      expect(() => new Reader(definitions)).toThrow(
        "Expected 1 top level type definition for 'test/Value' but found 0",
      );
    });
  },
);
