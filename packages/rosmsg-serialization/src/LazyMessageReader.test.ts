import { parse as parseMessageDefinition } from "@foxglove/rosmsg";
import parserBabel from "prettier/parser-babel";
import prettier from "prettier/standalone";

import { LazyMessageReader } from "./LazyMessageReader";
import messageReaderTests from "./fixtures/messageReaderTests";

describe("LazyReader", () => {
  it.each(messageReaderTests)(
    "should deserialize %s",
    (msgDef: string, arr: Iterable<number>, expected: Record<string, unknown>) => {
      const buffer = Uint8Array.from(arr);
      const reader = new LazyMessageReader<Record<string, unknown>>(parseMessageDefinition(msgDef));

      // allows for easier review of the generated parser source
      const source = reader.source();
      expect(prettier.format(source, { parser: "babel", plugins: [parserBabel] })).toMatchSnapshot(
        msgDef,
      );

      // read aligned array
      {
        const read = reader.readMessage(buffer);

        // check that our reader expected size matches the buffer size
        expect(reader.size(buffer)).toEqual(buffer.length);

        // check that our message matches the full object
        const obj = read.toObject();
        expect(read.toObject()).toEqual(expected);

        // legacy api
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
