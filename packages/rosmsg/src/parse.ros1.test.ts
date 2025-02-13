// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { MessageDefinition } from "@foxglove/message-definition";

import { fixupTypes, parse } from "./parse";

describe("parseMessageDefinition", () => {
  it("parses a single field from a single message", () => {
    const types = parse("string name", { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "name",
            type: "string",
          },
        ],
      },
    ]);
  });

  it("rejects valid tokens that don't fully match a parser rule", () => {
    expect(() => parse("abc", { topLevelTypeName: "x" })).toThrow("Could not parse line: 'abc'");
  });

  it.each(["_a", "3a"])("rejects invalid field name %s", (name) => {
    expect(() => parse(`string ${name}`, { topLevelTypeName: "x" })).toThrow();
  });
  it.each(["3a"])("rejects invalid constant name %s", (name) => {
    expect(() => parse(`string ${name} = 'x'`, { topLevelTypeName: "x" })).toThrow();
  });
  it.each(["a", "a_", "foo_bar", "foo__bar", "foo1_2bar"])(
    "accepts valid field name %s",
    (name) => {
      expect(parse(`string ${name}`, { topLevelTypeName: "Dummy" })).toEqual([
        {
          name: "Dummy",
          definitions: [
            { arrayLength: undefined, isArray: false, isComplex: false, name, type: "string" },
          ],
        },
      ]);
    },
  );
  it.each(["a", "_a", "a_", "foo_bar", "foo__Bar", "FOO1_2BAR"])(
    "accepts valid constant name %s",
    (name) => {
      expect(parse(`string ${name} = x`, { topLevelTypeName: "Dummy" })).toEqual([
        {
          name: "Dummy",
          definitions: [{ name, type: "string", isConstant: true, value: "x", valueText: "x" }],
        },
      ]);
    },
  );

  it("resolves unqualified names", () => {
    const messageDefinition = `
      Point[] points
      ============
      MSG: geometry_msgs/Point
      float64 x
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: true,
            isComplex: true,
            name: "points",
            type: "geometry_msgs/Point",
          },
        ],
      },
      {
        name: "geometry_msgs/Point",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "x",
            type: "float64",
          },
        ],
      },
    ]);
  });

  it("normalizes aliases", () => {
    const types = parse("char x\nbyte y", { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "x",
            type: "uint8",
          },
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "y",
            type: "int8",
          },
        ],
      },
    ]);
  });

  it("ignores comment lines", () => {
    const messageDefinition = `
    # your first name goes here
    string firstName

    # last name here
    ### foo bar baz?
    string lastName
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "firstName",
            type: "string",
          },
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "lastName",
            type: "string",
          },
        ],
      },
    ]);
  });

  it.each(["string", "int32", "int64"])("parses variable length %s array", (type) => {
    const types = parse(`${type}[] names`, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: true,
            isComplex: false,
            name: "names",
            type,
          },
        ],
      },
    ]);
  });

  it("parses fixed length string array", () => {
    const types = parse("string[3] names", { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: 3,
            isArray: true,
            isComplex: false,
            name: "names",
            type: "string",
          },
        ],
      },
    ]);
  });

  it("parses nested complex types", () => {
    const messageDefinition = `
    string username
    Account account
    ============
    MSG: custom_type/Account
    string name
    uint16 id
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "username",
            type: "string",
          },
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: true,
            name: "account",
            type: "custom_type/Account",
          },
        ],
      },
      {
        name: "custom_type/Account",
        definitions: [
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "name",
            type: "string",
          },
          {
            arrayLength: undefined,
            isArray: false,
            isComplex: false,
            name: "id",
            type: "uint16",
          },
        ],
      },
    ]);
  });

  it("returns constants", () => {
    const messageDefinition = `
      uint32 foo = 55
      int32 bar=-11 # Comment # another comment
      float32 baz= \t -32.25
      bool someBoolean = 0
      string fooStr = Foo    ${""}
      string EMPTY1 =  ${""}
      string EMPTY2 =
      string HASH = #
      string EXAMPLE="#comments" are ignored, and leading and trailing whitespace removed
      uint64 SMOOTH_MOVE_START    = 0000000000000001 # e.g. kobuki_msgs/VersionInfo
      int64 LARGE_VALUE = -9223372036854775807
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            name: "foo",
            type: "uint32",
            isConstant: true,
            value: 55,
            valueText: "55",
          },
          {
            name: "bar",
            type: "int32",
            isConstant: true,
            value: -11,
            valueText: "-11",
          },
          {
            name: "baz",
            type: "float32",
            isConstant: true,
            value: -32.25,
            valueText: "-32.25",
          },
          {
            name: "someBoolean",
            type: "bool",
            isConstant: true,
            value: false,
            valueText: "0",
          },
          {
            name: "fooStr",
            type: "string",
            isConstant: true,
            value: "Foo",
            valueText: "Foo",
          },
          {
            name: "EMPTY1",
            type: "string",
            isConstant: true,
            value: "",
            valueText: "",
          },
          {
            name: "EMPTY2",
            type: "string",
            isConstant: true,
            value: "",
            valueText: "",
          },
          {
            name: "HASH",
            type: "string",
            isConstant: true,
            value: "#",
            valueText: "#",
          },
          {
            name: "EXAMPLE",
            type: "string",
            isConstant: true,
            value: '"#comments" are ignored, and leading and trailing whitespace removed',
            valueText: '"#comments" are ignored, and leading and trailing whitespace removed',
          },
          {
            name: "SMOOTH_MOVE_START",
            type: "uint64",
            isConstant: true,
            value: 1n,
            valueText: "0000000000000001",
          },
          {
            name: "LARGE_VALUE",
            type: "int64",
            isConstant: true,
            value: -9223372036854775807n,
            valueText: "-9223372036854775807",
          },
        ],
      },
    ]);
  });

  it("works with python boolean values", () => {
    const messageDefinition = `
      bool Alive=True
      bool Dead=False
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            name: "Alive",
            type: "bool",
            isConstant: true,
            value: true,
            valueText: "True",
          },
          {
            name: "Dead",
            type: "bool",
            isConstant: true,
            value: false,
            valueText: "False",
          },
        ],
      },
    ]);
  });

  it("handles type names for fields", () => {
    expect(parse(`time time`, { topLevelTypeName: "Dummy" })).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            name: "time",
            type: "time",
            isArray: false,
            isComplex: false,
          },
        ],
      },
    ]);

    expect(parse(`time time_ref`, { topLevelTypeName: "Dummy" })).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            name: "time_ref",
            type: "time",
            isArray: false,
            isComplex: false,
          },
        ],
      },
    ]);

    expect(
      parse(
        `
    true true
    ============
    MSG: custom/true
    bool false
    `,
        { topLevelTypeName: "Dummy" },
      ),
    ).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            name: "true",
            type: "custom/true",
            isArray: false,
            isComplex: true,
          },
        ],
      },
      {
        definitions: [
          {
            name: "false",
            type: "bool",
            isArray: false,
            isComplex: false,
          },
        ],
        name: "custom/true",
      },
    ]);
  });

  it("allows numbers in package names", () => {
    expect(
      parse(
        `
    abc1/Foo2 value0
    ==========
    MSG: abc1/Foo2
    int32 data
    `,
        { topLevelTypeName: "Dummy" },
      ),
    ).toEqual([
      {
        name: "Dummy",
        definitions: [{ isArray: false, isComplex: true, name: "value0", type: "abc1/Foo2" }],
      },
      {
        name: "abc1/Foo2",
        definitions: [{ isArray: false, isComplex: false, name: "data", type: "int32" }],
      },
    ]);
  });
});

describe("fixupTypes", () => {
  it("works with an empty list", () => {
    const types: MessageDefinition[] = [];
    fixupTypes(types);
    expect(types).toEqual([]);
  });

  it("rewrites type names as expected", () => {
    const messageDefinition = `
      Point[] points
      ============
      MSG: geometry_msgs/Point
      float64 x
    `;
    const types = parse(messageDefinition, { skipTypeFixup: true, topLevelTypeName: "Points" });

    expect(types).toEqual([
      {
        name: "Points",
        definitions: [
          {
            isArray: true,
            isComplex: true,
            name: "points",
            type: "Point",
          },
        ],
      },
      {
        name: "geometry_msgs/Point",
        definitions: [
          {
            isArray: false,
            isComplex: false,
            name: "x",
            type: "float64",
          },
        ],
      },
    ]);

    fixupTypes(types);

    expect(types).toEqual([
      {
        name: "Points",
        definitions: [
          {
            isArray: true,
            isComplex: true,
            name: "points",
            type: "geometry_msgs/Point",
          },
        ],
      },
      {
        name: "geometry_msgs/Point",
        definitions: [
          {
            isArray: false,
            isComplex: false,
            name: "x",
            type: "float64",
          },
        ],
      },
    ]);
  });

  it("does not mixup types with same name but different namespace", () => {
    const messageDefinition = `
      int32 dummy

      ===
      MSG: visualization_msgs/Marker
      int32 a

      ===
      MSG: aruco_msgs/Marker
      int32 b

      ===
      MSG: visualization_msgs/MarkerArray
      Marker[] a

      ===
      MSG: aruco_msgs/MarkerArray
      Marker[] b
    `;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            type: "int32",
            isArray: false,
            name: "dummy",
            isComplex: false,
          },
        ],
      },
      {
        name: "visualization_msgs/Marker",
        definitions: [
          {
            type: "int32",
            isArray: false,
            name: "a",
            isComplex: false,
          },
        ],
      },
      {
        name: "aruco_msgs/Marker",
        definitions: [
          {
            type: "int32",
            isArray: false,
            name: "b",
            isComplex: false,
          },
        ],
      },
      {
        name: "visualization_msgs/MarkerArray",
        definitions: [
          {
            type: "visualization_msgs/Marker",
            isArray: true,
            name: "a",
            isComplex: true,
          },
        ],
      },
      {
        name: "aruco_msgs/MarkerArray",
        definitions: [
          {
            type: "aruco_msgs/Marker",
            isArray: true,
            name: "b",
            isComplex: true,
          },
        ],
      },
    ]);
  });

  it("correctly resolves Header to std_msgs/Header", () => {
    const messageDefinition = `
      StampedBool stamped_bool
      ================================================================================
      MSG: custom_msg/StampedBool
      Header header
      bool data
      ================================================================================
      MSG: std_msgs/Header
      uint32 seq
      time stamp
      string frame_id`;
    const types = parse(messageDefinition, { topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            type: "custom_msg/StampedBool",
            isArray: false,
            name: "stamped_bool",
            isComplex: true,
          },
        ],
      },
      {
        name: "custom_msg/StampedBool",
        definitions: [
          {
            type: "std_msgs/Header",
            isArray: false,
            name: "header",
            isComplex: true,
          },
          {
            type: "bool",
            isArray: false,
            name: "data",
            isComplex: false,
          },
        ],
      },
      {
        name: "std_msgs/Header",
        definitions: [
          {
            type: "uint32",
            isArray: false,
            name: "seq",
            isComplex: false,
          },
          {
            type: "time",
            isArray: false,
            name: "stamp",
            isComplex: false,
          },
          {
            type: "string",
            isArray: false,
            name: "frame_id",
            isComplex: false,
          },
        ],
      },
    ]);
  });

  it("handles duplicate types", () => {
    const messageDefinition = `
    foo_msgs/TypeA a
    foo_msgs/TypeB b
    ================================================================================
    MSG: foo_msgs/TypeA

    uint64 u
    ================================================================================
    MSG: foo_msgs/TypeB

    foo_msgs/TypeA a
    int32 i
    ================================================================================
    MSG: foo_msgs/TypeA

    uint64 u
    `;
    const types = parse(messageDefinition, { ros2: true, topLevelTypeName: "Dummy" });
    expect(types).toEqual([
      {
        name: "Dummy",
        definitions: [
          {
            type: "foo_msgs/TypeA",
            isArray: false,
            name: "a",
            isComplex: true,
          },
          {
            type: "foo_msgs/TypeB",
            isArray: false,
            name: "b",
            isComplex: true,
          },
        ],
      },
      {
        name: "foo_msgs/TypeA",
        definitions: [
          {
            type: "uint64",
            isArray: false,
            name: "u",
            isComplex: false,
          },
        ],
      },
      {
        name: "foo_msgs/TypeB",
        definitions: [
          {
            type: "foo_msgs/TypeA",
            isArray: false,
            name: "a",
            isComplex: true,
          },
          {
            type: "int32",
            isArray: false,
            name: "i",
            isComplex: false,
          },
        ],
      },
    ]);
  });

  describe("enum inference", () => {
    it("handles various constant types", () => {
      expect(
        parse(
          `
          uint32 OFF=0
          uint32 ON=1
          uint32 state
          uint8 RED=0
          uint8 YELLOW=1
          uint8 GREEN=2
          uint8 color
          uint64 ONE=1
          uint64 TWO=2
          uint64 large_number

          ===
          MSG: my_msgs/NestedMsg
          string FOO=foo
          string BAR=bar
          string str
          bool YEP=True
          bool NOPE=False
          bool maybe
          `,
          { topLevelTypeName: "Dummy" },
        ),
      ).toEqual([
        {
          name: "Dummy",
          definitions: [
            { type: "uint32", name: "OFF", isConstant: true, value: 0, valueText: "0" },
            { type: "uint32", name: "ON", isConstant: true, value: 1, valueText: "1" },
            {
              type: "uint32",
              name: "state",
              isArray: false,
              isComplex: false,
              enumType: "enum for Dummy.state",
            },
            { type: "uint8", name: "RED", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "YELLOW", isConstant: true, value: 1, valueText: "1" },
            { type: "uint8", name: "GREEN", isConstant: true, value: 2, valueText: "2" },
            {
              type: "uint8",
              name: "color",
              isArray: false,
              isComplex: false,
              enumType: "enum for Dummy.color",
            },
            { type: "uint64", name: "ONE", isConstant: true, value: 1n, valueText: "1" },
            { type: "uint64", name: "TWO", isConstant: true, value: 2n, valueText: "2" },
            {
              type: "uint64",
              name: "large_number",
              isArray: false,
              isComplex: false,
              enumType: "enum for Dummy.large_number",
            },
          ],
        },
        {
          name: "my_msgs/NestedMsg",
          definitions: [
            { type: "string", name: "FOO", isConstant: true, value: "foo", valueText: "foo" },
            { type: "string", name: "BAR", isConstant: true, value: "bar", valueText: "bar" },
            {
              type: "string",
              name: "str",
              isArray: false,
              isComplex: false,
              enumType: "enum for my_msgs/NestedMsg.str",
            },
            { type: "bool", name: "YEP", isConstant: true, value: true, valueText: "True" },
            { type: "bool", name: "NOPE", isConstant: true, value: false, valueText: "False" },
            {
              type: "bool",
              name: "maybe",
              isArray: false,
              isComplex: false,
              enumType: "enum for my_msgs/NestedMsg.maybe",
            },
          ],
        },
        {
          name: "enum for Dummy.state",
          definitions: [
            { type: "uint32", name: "OFF", isConstant: true, value: 0, valueText: "0" },
            { type: "uint32", name: "ON", isConstant: true, value: 1, valueText: "1" },
          ],
        },
        {
          name: "enum for Dummy.color",
          definitions: [
            { type: "uint8", name: "RED", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "YELLOW", isConstant: true, value: 1, valueText: "1" },
            { type: "uint8", name: "GREEN", isConstant: true, value: 2, valueText: "2" },
          ],
        },
        {
          name: "enum for Dummy.large_number",
          definitions: [
            { type: "uint64", name: "ONE", isConstant: true, value: 1n, valueText: "1" },
            { type: "uint64", name: "TWO", isConstant: true, value: 2n, valueText: "2" },
          ],
        },
        {
          name: "enum for my_msgs/NestedMsg.str",
          definitions: [
            { type: "string", name: "FOO", isConstant: true, value: "foo", valueText: "foo" },
            { type: "string", name: "BAR", isConstant: true, value: "bar", valueText: "bar" },
          ],
        },
        {
          name: "enum for my_msgs/NestedMsg.maybe",
          definitions: [
            { type: "bool", name: "YEP", isConstant: true, value: true, valueText: "True" },
            { type: "bool", name: "NOPE", isConstant: true, value: false, valueText: "False" },
          ],
        },
      ]);
    });

    it("handles multiple blocks of constants of the same type", () => {
      expect(
        parse(
          `
          uint8 OFF=0
          uint8 ON=1
          uint8 state1
          uint8 FOO=0
          uint8 BAR=1
          uint8 state2
          `,
          { topLevelTypeName: "Dummy" },
        ),
      ).toEqual([
        {
          name: "Dummy",
          definitions: [
            { type: "uint8", name: "OFF", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "ON", isConstant: true, value: 1, valueText: "1" },
            {
              type: "uint8",
              name: "state1",
              isArray: false,
              isComplex: false,
              enumType: "enum for Dummy.state1",
            },
            { type: "uint8", name: "FOO", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "BAR", isConstant: true, value: 1, valueText: "1" },
            {
              type: "uint8",
              name: "state2",
              isArray: false,
              isComplex: false,
              enumType: "enum for Dummy.state2",
            },
          ],
        },
        {
          name: "enum for Dummy.state1",
          definitions: [
            { type: "uint8", name: "OFF", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "ON", isConstant: true, value: 1, valueText: "1" },
          ],
        },
        {
          name: "enum for Dummy.state2",
          definitions: [
            { type: "uint8", name: "FOO", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "BAR", isConstant: true, value: 1, valueText: "1" },
          ],
        },
      ]);
    });

    it("only assigns constants to matching types", () => {
      expect(
        parse(
          `
          uint8 OFF=0
          uint8 ON=1
          uint32 state32
          uint8 state8
          `,
          { topLevelTypeName: "Dummy" },
        ),
      ).toEqual([
        {
          name: "Dummy",
          definitions: [
            { type: "uint8", name: "OFF", isConstant: true, value: 0, valueText: "0" },
            { type: "uint8", name: "ON", isConstant: true, value: 1, valueText: "1" },
            { type: "uint32", name: "state32", isArray: false, isComplex: false },
            { type: "uint8", name: "state8", isArray: false, isComplex: false },
          ],
        },
        // no enums inferred as the first type after constants doesn't match constant type
      ]);
    });
  });
});
