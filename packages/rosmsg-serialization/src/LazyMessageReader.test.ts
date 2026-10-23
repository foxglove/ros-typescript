import type { MessageDefinition } from "@foxglove/message-definition";
import { parse as parseMessageDefinition } from "@foxglove/rosmsg";

import { LazyMessageReader } from "./LazyMessageReader";
import messageReaderTests from "./fixtures/messageReaderTests";

describe("LazyReader", () => {
  it("does not compile message definitions into code", () => {
    const functionSpy = jest.spyOn(globalThis, "Function");
    const evalSpy = jest.spyOn(globalThis, "eval");
    try {
      const reader = new LazyMessageReader<{ inners: { data: string }[] }>(
        parseMessageDefinition("Inner[] inners\n===\nMSG: foo_msgs/Inner\nstring data"),
      );
      const read = reader.readMessage(Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0, 97]));
      expect(read.inners[0]?.data).toEqual("a");
      expect(read.toObject()).toEqual({ inners: [{ data: "a" }] });
      expect(functionSpy).not.toHaveBeenCalled();
      expect(evalSpy).not.toHaveBeenCalled();
    } finally {
      functionSpy.mockRestore();
      evalSpy.mockRestore();
    }
  });

  it("treats field names as data", () => {
    const globalWithMarker = globalThis as typeof globalThis & {
      rosmsgSerializationLazyReaderInjected?: boolean;
    };
    delete globalWithMarker.rosmsgSerializationLazyReaderInjected;
    const payloadName = "x; globalThis.rosmsgSerializationLazyReaderInjected = true; this.y";
    const definitions: MessageDefinition[] = [
      {
        definitions: [
          {
            name: payloadName,
            type: "uint8",
            isArray: false,
            isComplex: false,
            isConstant: false,
          },
        ],
      },
    ];

    const read = new LazyMessageReader<Record<string, unknown>>(definitions).readMessage(
      Uint8Array.from([5]),
    );

    expect(read[payloadName]).toEqual(5);
    expect(read.toObject()).toEqual({ [payloadName]: 5 });
    expect(globalWithMarker.rosmsgSerializationLazyReaderInjected).toBeUndefined();
  });

  it.each([
    { description: "punctuation", typeName: "foo-msgs/Inner" },
    { description: "a line terminator", typeName: "foo\u2028msgs/Inner" },
  ])("treats type names containing $description as data", ({ typeName }) => {
    const reader = new LazyMessageReader<{ inner: { data: number } }>(
      parseMessageDefinition(`Inner inner\n===\nMSG: ${typeName}\nuint8 data`),
    );

    const read = reader.readMessage(Uint8Array.from([5]));

    expect(read.inner.data).toEqual(5);
    expect(read.toObject()).toEqual({ inner: { data: 5 } });
  });

  it.each(messageReaderTests)(
    "should deserialize %s",
    (msgDef: string, arr: Iterable<number>, expected: Record<string, unknown>) => {
      const buffer = Uint8Array.from(arr);
      const reader = new LazyMessageReader<Record<string, unknown>>(parseMessageDefinition(msgDef));

      // read aligned array
      {
        const read = reader.readMessage(buffer);

        // check that our reader expected size matches the buffer size
        expect(reader.size(buffer)).toEqual(buffer.length);

        // check that our message matches the full object
        const obj = read.toObject();
        expect(read.toObject()).toEqual(expected);

        // legacy api
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(read.toJSON()).toEqual(expected);

        // manually read each field to ensure lazy field access works
        for (const key in obj) {
          if (typeof expected[key] === "object") {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(read[key]).toMatchObject(expected[key] as any); // eslint-disable-line @typescript-eslint/no-explicit-any
          } else {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(read[key]).toEqual(expected[key]);
          }
        }
      }

      // read offset array
      {
        const offset = 7;
        const fullArr = new Uint8Array(buffer.length + offset);
        fullArr.set(buffer, offset);

        const read = reader.readMessage(
          new Uint8Array(fullArr.buffer, fullArr.byteOffset + offset, fullArr.byteLength - offset),
        );
        expect(reader.size(buffer)).toEqual(buffer.length);

        const obj = read.toObject();
        expect(obj).toEqual(expected);

        // legacy api
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(read.toJSON()).toEqual(expected);

        // manually read each field to ensure lazy field access works
        for (const key in obj) {
          if (typeof expected[key] === "object") {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(read[key]).toMatchObject(expected[key] as any); // eslint-disable-line @typescript-eslint/no-explicit-any
          } else {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(read[key]).toEqual(expected[key]);
          }
        }
      }
    },
  );

  it("should support toObject for individual array fields", () => {
    const msgDef = `CustomType[3] custom
    ============
    MSG: custom_type/CustomType
    uint8 first`;

    const arr = [0x02, 0x03, 0x04];

    const buffer = Uint8Array.from(arr);
    const reader = new LazyMessageReader<{
      custom: { toJSON: () => unknown; toObject: () => unknown }[];
    }>(parseMessageDefinition(msgDef));

    const read = reader.readMessage(buffer);
    expect(read.custom[0]?.toObject()).toEqual({ first: 2 });
    expect(read.custom[1]?.toObject()).toEqual({ first: 3 });
    expect(read.custom[2]?.toObject()).toEqual({ first: 4 });

    // legacy api
    expect(read.custom[0]?.toJSON()).toEqual({ first: 2 });
    expect(read.custom[1]?.toJSON()).toEqual({ first: 3 });
    expect(read.custom[2]?.toJSON()).toEqual({ first: 4 });
  });

  it("should support toObject for individual fields", () => {
    const msgDef = `CustomType custom1
    CustomType custom2
    ============
    MSG: custom_type/CustomType
    uint8 first`;

    const arr = [0x03, 0x07];

    const buffer = Uint8Array.from(arr);
    const reader = new LazyMessageReader<{
      custom1: { toJSON: () => unknown; toObject: () => unknown };
      custom2: { toJSON: () => unknown; toObject: () => unknown };
    }>(parseMessageDefinition(msgDef));

    const read = reader.readMessage(buffer);
    expect(read.custom1.toObject()).toEqual({ first: 3 });
    expect(read.custom2.toObject()).toEqual({ first: 7 });

    // legacy api
    expect(read.custom1.toJSON()).toEqual({ first: 3 });
    expect(read.custom2.toJSON()).toEqual({ first: 7 });
  });

  it("should support field names ending in _offset", () => {
    const msgDef = `CustomType custom
    ============
    MSG: custom_type/CustomType
    uint8 first
    uint8 first_offset`;

    const arr = [0x03, 0x07];

    const buffer = Uint8Array.from(arr);
    const reader = new LazyMessageReader<{
      custom: { first: number; first_offset: number };
    }>(parseMessageDefinition(msgDef));

    const read = reader.readMessage(buffer);
    expect(read.custom.first).toEqual(3);
    expect(read.custom.first_offset).toEqual(7);
  });
});
