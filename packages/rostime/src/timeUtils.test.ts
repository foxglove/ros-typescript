import * as rostime from ".";
import { Time } from ".";

describe("isTime", () => {
  it("works", () => {
    expect(rostime.isTime(undefined)).toEqual(false);
    expect(rostime.isTime(false)).toEqual(false);
    expect(rostime.isTime(true)).toEqual(false);
    expect(rostime.isTime({})).toEqual(false);
    expect(rostime.isTime({ sec: 1 })).toEqual(false);
    expect(rostime.isTime({ nsec: 1 })).toEqual(false);
    expect(rostime.isTime({ sec: 1, nsec: 1, other: undefined })).toEqual(false);
    expect(rostime.isTime({ sec: 1, nsec: 1, other: 0 })).toEqual(false);

    expect(rostime.isTime({ sec: 0, nsec: 0 })).toEqual(true);
    expect(rostime.isTime({ sec: 1, nsec: 0 })).toEqual(true);
    expect(rostime.isTime({ sec: 1624947142, nsec: 42 })).toEqual(true);
  });
});

describe("toRFC3339String", () => {
  it("formats whole values correctly", () => {
    expect(rostime.toRFC3339String({ sec: 1, nsec: 0 })).toEqual("1970-01-01T00:00:01.000000000Z");
  });

  it("formats partial nanos", () => {
    expect(rostime.toRFC3339String({ sec: 102, nsec: 304 })).toEqual(
      "1970-01-01T00:01:42.000000304Z",
    );
    expect(rostime.toRFC3339String({ sec: 102, nsec: 99900000 })).toEqual(
      "1970-01-01T00:01:42.099900000Z",
    );
  });

  it("formats max nanos", () => {
    expect(rostime.toRFC3339String({ sec: 102, nsec: 999999999 })).toEqual(
      "1970-01-01T00:01:42.999999999Z",
    );
  });

  it("does not format negative times", () => {
    expect(() => rostime.toRFC3339String({ sec: -1, nsec: 0 })).toThrow();
  });

  it("interoperates with Date.parse", () => {
    const date = new Date(Date.UTC(2021, 8, 29, 18, 12, 8, 123));
    expect(Date.parse(rostime.toRFC3339String(rostime.fromDate(date)))).toEqual(+date);
  });
});

describe("fromRFC3339String", () => {
  it("parses nanosecond precision", () => {
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.0000000Z")).toEqual({
      sec: 0,
      nsec: 0,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.000000001Z")).toEqual({
      sec: 0,
      nsec: 1,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.0000000001Z")).toEqual({
      sec: 0,
      nsec: 0,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.100000000Z")).toEqual({
      sec: 0,
      nsec: 100_000_000,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.0123Z")).toEqual({
      sec: 0,
      nsec: 12_300_000,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.012345678Z")).toEqual({
      sec: 0,
      nsec: 12_345_678,
    });
  });

  it("rounds to nearest nanosecond", () => {
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.0123456789Z")).toEqual({
      sec: 0,
      nsec: 12_345_679,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.9999999991Z")).toEqual({
      sec: 0,
      nsec: 999_999_999,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:00.9999999995Z")).toEqual({
      sec: 1,
      nsec: 0,
    });
    expect(rostime.fromRFC3339String("1970-01-01T00:00:01.9999999995Z")).toEqual({
      sec: 2,
      nsec: 0,
    });
  });

  it("handles time zone offsets", () => {
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789+00:00")).toEqual({
      sec: 1632939128,
      nsec: 123_456_789,
    });
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789-00:00")).toEqual({
      sec: 1632939128,
      nsec: 123_456_789,
    });
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789+00:01")).toEqual({
      sec: 1632939128 - 60,
      nsec: 123_456_789,
    });
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789-00:01")).toEqual({
      sec: 1632939128 + 60,
      nsec: 123_456_789,
    });
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789+10:09")).toEqual({
      sec: 1632939128 - (10 * 60 + 9) * 60,
      nsec: 123_456_789,
    });
    expect(rostime.fromRFC3339String("2021-09-29T18:12:08.123456789-10:09")).toEqual({
      sec: 1632939128 + (10 * 60 + 9) * 60,
      nsec: 123_456_789,
    });
  });

  it("interoperates with Date.toISOString", () => {
    const date = new Date(Date.UTC(2021, 8, 29, 18, 12, 8, 123));
    expect(rostime.fromRFC3339String(date.toISOString())).toEqual({
      sec: 1632939128,
      nsec: 123_000_000,
    });
  });
});

describe("toString", () => {
  it("formats whole values correctly", () => {
    expect(rostime.toString({ sec: 1, nsec: 0 })).toEqual("1.000000000");
  });

  it("formats partial nanos", () => {
    expect(rostime.toString({ sec: 102, nsec: 304 })).toEqual("102.000000304");
    expect(rostime.toString({ sec: 102, nsec: 99900000 })).toEqual("102.099900000");
  });

  it("formats max nanos", () => {
    expect(rostime.toString({ sec: 102, nsec: 999000000 })).toEqual("102.999000000");
  });

  it("does not format negative times", () => {
    expect(() => rostime.toString({ sec: -1, nsec: 0 })).toThrow();
  });
});

describe("fromString", () => {
  it("converts from nanoseconds to time", () => {
    const nanos1 = "1508410740.582458241";
    expect(rostime.fromString(nanos1)).toEqual({ sec: 1508410740, nsec: 582458241 });
    const nanos2 = "1508428043.155306000";
    expect(rostime.fromString(nanos2)).toEqual({ sec: 1508428043, nsec: 155306000 });
    expect(rostime.fromString("5001")).toEqual({ sec: 5001, nsec: 0 });
    const nanos3 = `${1e10 + 1}`;
    expect(rostime.fromString(nanos3)).toEqual({ sec: 1e10 + 1, nsec: 0 });
    expect(rostime.fromString("0")).toEqual({ sec: 0, nsec: 0 });
    expect(rostime.fromString("1000.000")).toEqual({ sec: 1000, nsec: 0 });
  });

  it("does not convert invalid times", () => {
    expect(rostime.fromString("1000x00")).toBeUndefined();
    expect(rostime.fromString("1000 00")).toBeUndefined();
    expect(rostime.fromString("")).toBeUndefined();
    expect(rostime.fromString("-1")).toBeUndefined();
  });

  it("returns undefined if the input string is formatted incorrectly", () => {
    expect(rostime.fromString("")).toEqual(undefined);
    expect(rostime.fromString(".12121")).toEqual(undefined);
    expect(rostime.fromString(".")).toEqual(undefined);
  });

  it("returns the correct time", () => {
    expect(rostime.fromString("12121.")).toEqual({ sec: 12121, nsec: 0 });
    expect(rostime.fromString("1")).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromString("1.")).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromString("1.12")).toEqual({ sec: 1, nsec: 0.12e9 });
    expect(rostime.fromString("100.100")).toEqual({ sec: 100, nsec: 0.1e9 });
    expect(rostime.fromString("100")).toEqual({ sec: 100, nsec: 0 });
    // Full nanosecond timestamp
    expect(rostime.fromString("1.123456789")).toEqual({ sec: 1, nsec: 0.123456789e9 });
    // Too much precision
    expect(rostime.fromString("1.0123456789")).toEqual({ sec: 1, nsec: 0.012345679e9 });
    // Too much precision, round seconds up.
    expect(rostime.fromString("1.999999999999")).toEqual({ sec: 2, nsec: 0 });
  });
});

describe("toDate & fromDate", () => {
  it("converts to date and from date", () => {
    const totalSeconds = Math.round(Date.now() / 1000);
    const stamp = { sec: totalSeconds, nsec: 1000 };
    const now = new Date(totalSeconds * 1000);
    expect(rostime.toDate(stamp)).toEqual(now);
    expect(rostime.fromDate(now)).toEqual({ sec: totalSeconds, nsec: 0 });

    const nowPlus1ms = new Date(totalSeconds * 1000 + 1);
    expect(rostime.toDate({ sec: totalSeconds, nsec: 1 * 1e6 })).toEqual(nowPlus1ms);
    expect(rostime.fromDate(nowPlus1ms)).toEqual({
      sec: totalSeconds,
      nsec: 1000000,
    });
  });

  it("can be created from a date", () => {
    const date = new Date(1511798097280);
    const time = rostime.fromDate(date);
    expect(time.sec).toBe(Math.floor(1511798097280 / 1000));
    expect(time.nsec).toBe(280000000);
  });

  it("can convert to a date", () => {
    const date = new Date(1511798097280);
    const time = { sec: 1511798097, nsec: 280000000 };
    expect(rostime.toDate(time)).toEqual(date);
  });
});

describe("percentOf", () => {
  it("gives percentages correctly", () => {
    const start = { sec: 0, nsec: 0 };
    const end = { sec: 10, nsec: 0 };
    expect(rostime.percentOf(start, end, { sec: 5, nsec: 0 })).toEqual(0.5);
    expect(rostime.percentOf(start, end, { sec: 1, nsec: 0 })).toEqual(0.1);
    expect(rostime.percentOf(start, end, { sec: 0, nsec: 1e9 })).toEqual(0.1);
    expect(rostime.percentOf(start, end, { sec: 0, nsec: 1e7 })).toEqual(0.001);
    expect(rostime.percentOf(start, end, { sec: -1, nsec: 0 })).toEqual(-0.1);
  });
});

describe("interpolate", () => {
  it("works for zero-duration spans", () => {
    const t = { sec: 0, nsec: 0 };
    expect(rostime.interpolate(t, t, 0)).toEqual(t);
    expect(rostime.interpolate(t, t, -1)).toEqual(t);
    expect(rostime.interpolate(t, t, 1)).toEqual(t);
  });

  it("works for non-zero spans", () => {
    const start = { sec: 0, nsec: 0 };
    const end = { sec: 5, nsec: 0 };
    expect(rostime.interpolate(start, end, 0)).toEqual(start);
    expect(rostime.interpolate(start, end, 1)).toEqual(end);
    expect(rostime.interpolate(start, end, 0.5)).toEqual({ sec: 2, nsec: 5e8 });
    expect(rostime.interpolate(start, end, 2)).toEqual({ sec: 10, nsec: 0 });
  });
});

describe("fixTime", () => {
  it("works", () => {
    expect(rostime.fixTime({ sec: 0, nsec: 0 }, false)).toEqual({ sec: 0, nsec: 0 });
    expect(rostime.fixTime({ sec: 0, nsec: 1 }, false)).toEqual({ sec: 0, nsec: 1 });
    expect(rostime.fixTime({ sec: 0, nsec: 1e9 - 1 }, false)).toEqual({ sec: 0, nsec: 1e9 - 1 });
    expect(rostime.fixTime({ sec: 0, nsec: 1e9 }, false)).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fixTime({ sec: 0, nsec: 1e9 + 1 }, false)).toEqual({ sec: 1, nsec: 1 });
    expect(rostime.fixTime({ sec: 0, nsec: 2e9 }, false)).toEqual({ sec: 2, nsec: 0 });
    expect(rostime.fixTime({ sec: 0, nsec: 2e9 + 1 }, false)).toEqual({ sec: 2, nsec: 1 });
    expect(rostime.fixTime({ sec: 1, nsec: 3e9 + 5 }, false)).toEqual({ sec: 4, nsec: 5 });

    expect(rostime.fixTime({ sec: 0, nsec: 0 }, true)).toEqual({ sec: 0, nsec: 0 });
    expect(rostime.fixTime({ sec: 1, nsec: 3e9 + 5 }, true)).toEqual({ sec: 4, nsec: 5 });
    expect(rostime.fixTime({ sec: 0, nsec: -1 }, true)).toEqual({ sec: -1, nsec: 999999999 });
    expect(rostime.fixTime({ sec: 1, nsec: -1 }, true)).toEqual({ sec: 0, nsec: 999999999 });
    expect(rostime.fixTime({ sec: -1, nsec: 0 }, true)).toEqual({ sec: -1, nsec: 0 });
    expect(rostime.fixTime({ sec: -1, nsec: -1 }, true)).toEqual({ sec: -2, nsec: 999999999 });
    expect(rostime.fixTime({ sec: -2, nsec: 0 }, true)).toEqual({ sec: -2, nsec: 0 });
    expect(rostime.fixTime({ sec: -2, nsec: 1 }, true)).toEqual({ sec: -2, nsec: 1 });
    expect(rostime.fixTime({ sec: -2, nsec: -1 }, true)).toEqual({ sec: -3, nsec: 999999999 });
  });
});

describe("add", () => {
  const testAddition = (left: Time, right: Time, expected: Time) => {
    expect(rostime.add(left, right)).toEqual(expected);
    expect(rostime.add(right, left)).toEqual(expected);
  };

  // eslint-disable-next-line jest/expect-expect
  it("can add two times together", () => {
    testAddition({ sec: 0, nsec: 0 }, { sec: 0, nsec: 0 }, { sec: 0, nsec: 0 });
    testAddition({ sec: 1, nsec: 100 }, { sec: 2, nsec: 200 }, { sec: 3, nsec: 300 });
    testAddition({ sec: 0, nsec: 1e9 - 1 }, { sec: 0, nsec: 1 }, { sec: 1, nsec: 0 });
    testAddition({ sec: 0, nsec: 1e9 - 1 }, { sec: 0, nsec: 101 }, { sec: 1, nsec: 100 });
    testAddition({ sec: 3, nsec: 0 }, { sec: 0, nsec: 2 * -1e9 }, { sec: 1, nsec: 0 });
    testAddition({ sec: 1, nsec: 1 }, { sec: 0, nsec: -2 }, { sec: 0, nsec: 1e9 - 1 });
    testAddition({ sec: 1, nsec: 1 }, { sec: 0, nsec: -2 }, { sec: 0, nsec: 1e9 - 1 });
    testAddition({ sec: 3, nsec: 1 }, { sec: -2, nsec: -2 }, { sec: 0, nsec: 1e9 - 1 });
    testAddition({ sec: 1, nsec: 0 }, { sec: 0, nsec: -1e9 }, { sec: 0, nsec: 0 });
    testAddition({ sec: 3, nsec: 1 }, { sec: 1, nsec: -2 }, { sec: 3, nsec: 1e9 - 1 });
    testAddition({ sec: 3, nsec: 0 }, { sec: 0, nsec: -(2 * 1e9) + 1 }, { sec: 1, nsec: 1 });
    testAddition({ sec: 10, nsec: 0 }, { sec: 10, nsec: 10 * 1e9 }, { sec: 30, nsec: 0 });
    testAddition({ sec: 10, nsec: 0 }, { sec: 10, nsec: -10 * 1e9 }, { sec: 10, nsec: 0 });
    testAddition({ sec: 0, nsec: 0 }, { sec: 10, nsec: -10 * 1e9 }, { sec: 0, nsec: 0 });
  });

  it("throws when addition results in negative time", () => {
    expect(() => rostime.add({ sec: 0, nsec: 0 }, { sec: -1, nsec: 0 })).toThrow();
    expect(() => rostime.add({ sec: 0, nsec: 0 }, { sec: 0, nsec: -1 })).toThrow();
  });
});

describe("subtractTimes", () => {
  it("subtracts times", () => {
    expect(rostime.subtract({ sec: 1, nsec: 1 }, { sec: 1, nsec: 1 })).toEqual({ sec: 0, nsec: 0 });
    expect(rostime.subtract({ sec: 1, nsec: 2 }, { sec: 2, nsec: 1 })).toEqual({
      sec: -1,
      nsec: 1,
    });
    expect(rostime.subtract({ sec: 5, nsec: 100 }, { sec: 2, nsec: 10 })).toEqual({
      sec: 3,
      nsec: 90,
    });
    expect(rostime.subtract({ sec: 1, nsec: 1e8 }, { sec: 0, nsec: 5e8 })).toEqual({
      sec: 0,
      nsec: 600000000,
    });
    expect(rostime.subtract({ sec: 1, nsec: 0 }, { sec: 0, nsec: 1e9 - 1 })).toEqual({
      sec: 0,
      nsec: 1,
    });
    expect(rostime.subtract({ sec: 0, nsec: 0 }, { sec: 0, nsec: 1 })).toEqual({
      sec: -1,
      nsec: 1e9 - 1,
    });
  });
});

describe("toNanoSec", () => {
  it("works", () => {
    expect(rostime.toNanoSec({ sec: 0, nsec: 1 })).toEqual(1n);
    expect(rostime.toNanoSec({ sec: 1, nsec: 0 })).toEqual(BigInt(1e9));
    expect(rostime.toNanoSec({ sec: 1, nsec: 1 })).toEqual(BigInt(1e9) + 1n);
    expect(rostime.toNanoSec({ sec: 2, nsec: 0 })).toEqual(BigInt(2e9));
    expect(rostime.toNanoSec({ sec: 2, nsec: 1 })).toEqual(BigInt(2e9) + 1n);
  });
});

describe("toMicroSec", () => {
  it("works", () => {
    expect(rostime.toMicroSec({ sec: 0, nsec: 1 })).toEqual(0.001);
    expect(rostime.toMicroSec({ sec: 0, nsec: 999 })).toEqual(0.999);
    expect(rostime.toMicroSec({ sec: 0, nsec: 1000 })).toEqual(1);
    expect(rostime.toMicroSec({ sec: 1, nsec: 0 })).toEqual(1e6);
    expect(rostime.toMicroSec({ sec: 1, nsec: 1 })).toEqual(1000000.001);
    expect(rostime.toMicroSec({ sec: 2, nsec: 0 })).toEqual(2e6);
    expect(rostime.toMicroSec({ sec: 2, nsec: 1 })).toEqual(2000000.001);
  });
});

describe("toSec", () => {
  it("works", () => {
    expect(rostime.toSec({ sec: 1, nsec: 0 })).toBe(1);
    expect(rostime.toSec({ sec: 1, nsec: 1 })).toBe(1.000000001);
    expect(rostime.toSec({ sec: 1, nsec: 999999999 })).toBe(1.999999999);
    expect(rostime.toSec({ sec: 1, nsec: 1000000000 })).toBe(2);
  });
});

describe("fromSec", () => {
  it("handles positive values", () => {
    expect(rostime.fromSec(1)).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromSec(1.000000001)).toEqual({ sec: 1, nsec: 1 });
    expect(rostime.fromSec(1.999999999)).toEqual({ sec: 1, nsec: 999999999 });
    expect(rostime.fromSec(1.9999999994)).toEqual({ sec: 1, nsec: 999999999 });
    expect(rostime.fromSec(1.999999999999)).toEqual({ sec: 2, nsec: 0 });
    expect(rostime.fromSec(2)).toEqual({ sec: 2, nsec: 0 });
  });

  it("handles negative values", () => {
    expect(rostime.fromSec(-1)).toEqual({ sec: -1, nsec: 0 });
    expect(rostime.fromSec(-1.000000001)).toEqual({ sec: -1, nsec: -1 });
    expect(rostime.fromSec(-1.999999999)).toEqual({ sec: -1, nsec: -999999999 });
    expect(rostime.fromSec(-1.9999999994)).toEqual({ sec: -1, nsec: -999999999 });
    expect(rostime.fromSec(-1.999999999999)).toEqual({ sec: -2, nsec: -0 });
    expect(rostime.fromSec(-2)).toEqual({ sec: -2, nsec: 0 });
  });
});

describe("fromNanoSec", () => {
  it("works", () => {
    expect(rostime.fromNanoSec(0n)).toEqual({ sec: 0, nsec: 0 });
    expect(rostime.fromNanoSec(1n)).toEqual({ sec: 0, nsec: 1 });
    expect(rostime.fromNanoSec(10n)).toEqual({ sec: 0, nsec: 10 });
    expect(rostime.fromNanoSec(BigInt(1e9))).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromNanoSec(BigInt(1e9) + 1n)).toEqual({ sec: 1, nsec: 1 });
    expect(rostime.fromNanoSec(BigInt(2e9))).toEqual({ sec: 2, nsec: 0 });
    expect(rostime.fromNanoSec(BigInt(2e9) + 1n)).toEqual({ sec: 2, nsec: 1 });
  });
});

describe("toMillis", () => {
  it("works", () => {
    expect(rostime.toMillis({ sec: 0, nsec: 0 }, false)).toEqual(0);
    expect(rostime.toMillis({ sec: 0, nsec: 0 }, true)).toEqual(0);
    expect(rostime.toMillis({ sec: 0, nsec: 1 }, false)).toEqual(0);
    expect(rostime.toMillis({ sec: 0, nsec: 1 }, true)).toEqual(1);
    expect(rostime.toMillis({ sec: 0, nsec: 1e6 - 1 }, false)).toEqual(0);
    expect(rostime.toMillis({ sec: 0, nsec: 1e6 - 1 }, true)).toEqual(1);
    expect(rostime.toMillis({ sec: 0, nsec: 1e6 }, false)).toEqual(1);
    expect(rostime.toMillis({ sec: 0, nsec: 1e6 }, true)).toEqual(1);
    expect(rostime.toMillis({ sec: 1, nsec: 0 }, false)).toEqual(1000);
    expect(rostime.toMillis({ sec: 1, nsec: 0 }, true)).toEqual(1000);
    expect(rostime.toMillis({ sec: 1, nsec: 1 }, false)).toEqual(1000);
    expect(rostime.toMillis({ sec: 1, nsec: 1 }, true)).toEqual(1001);
    expect(rostime.toMillis({ sec: 2, nsec: 0 }, false)).toEqual(2000);
    expect(rostime.toMillis({ sec: 2, nsec: 0 }, true)).toEqual(2000);
    expect(rostime.toMillis({ sec: 2, nsec: 1 }, false)).toEqual(2000);
    expect(rostime.toMillis({ sec: 2, nsec: 1 }, true)).toEqual(2001);
  });
});

describe("fromMillis", () => {
  it("handles positive values", () => {
    expect(rostime.fromMillis(1)).toEqual({ sec: 0, nsec: 1000000 });
    expect(rostime.fromMillis(1000)).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromMillis(2000000000005)).toEqual({ sec: 2000000000, nsec: 5000000 });
  });

  it("handles negative values", () => {
    expect(rostime.fromMillis(-1)).toEqual({ sec: -0, nsec: -1000000 });
    expect(rostime.fromMillis(-1000)).toEqual({ sec: -1, nsec: 0 });
  });
});

describe("fromMicros", () => {
  it("handles positive values", () => {
    expect(rostime.fromMicros(1)).toEqual({ sec: 0, nsec: 1000 });
    expect(rostime.fromMicros(1000)).toEqual({ sec: 0, nsec: 1000000 });
    expect(rostime.fromMicros(1000000)).toEqual({ sec: 1, nsec: 0 });
    expect(rostime.fromMicros(2000000000000005)).toEqual({ sec: 2000000000, nsec: 5000 });
  });

  it("handles negative values", () => {
    expect(rostime.fromMicros(-1)).toEqual({ sec: -0, nsec: -1000 });
    expect(rostime.fromMicros(-1000)).toEqual({ sec: -0, nsec: -1000000 });
    expect(rostime.fromMicros(-1000000)).toEqual({ sec: -1, nsec: 0 });
  });
});

describe("clampTime", () => {
  const start = { sec: 0, nsec: 100 };
  const end = { sec: 100, nsec: 100 };
  it("returns the clamped time", () => {
    expect(rostime.clampTime({ sec: 0, nsec: 99 }, start, end)).toEqual(start);
    expect(rostime.clampTime({ sec: 0, nsec: 101 }, start, end)).toEqual({ sec: 0, nsec: 101 });
    expect(rostime.clampTime({ sec: 100, nsec: 102 }, start, end)).toEqual(end);
  });
});

describe("isTimeInRangeInclusive", () => {
  const start = { sec: 0, nsec: 100 };
  const end = { sec: 100, nsec: 100 };
  it("returns whether time is between start and end, inclusive", () => {
    expect(rostime.isTimeInRangeInclusive(start, start, end)).toEqual(true);
    expect(rostime.isTimeInRangeInclusive(end, start, end)).toEqual(true);
    expect(rostime.isTimeInRangeInclusive({ sec: 50, nsec: 50 }, start, end)).toEqual(true);
    expect(rostime.isTimeInRangeInclusive({ sec: 0, nsec: 99 }, start, end)).toEqual(false);
    expect(rostime.isTimeInRangeInclusive({ sec: 100, nsec: 101 }, start, end)).toEqual(false);
  });
});

describe("comparison", () => {
  it("can sort by compare", () => {
    const times = [
      { sec: 1, nsec: 1 },
      { sec: 0, nsec: 0 },
      { sec: 1, nsec: 0 },
      { sec: 0, nsec: 1 },
    ];
    times.sort(rostime.compare);
    expect(times).toEqual([
      { sec: 0, nsec: 0 },
      { sec: 0, nsec: 1 },
      { sec: 1, nsec: 0 },
      { sec: 1, nsec: 1 },
    ]);
  });

  it("has lessThan functionality", () => {
    const min = { sec: 0, nsec: 0 };
    const oneNano = { sec: 0, nsec: 1 };
    const max = { sec: 1, nsec: 1 };
    expect(rostime.isLessThan(min, min)).toBe(false);
    expect(rostime.isLessThan(max, min)).toBe(false);
    expect(rostime.isLessThan(oneNano, min)).toBe(false);
    expect(rostime.isLessThan(min, oneNano)).toBe(true);
    expect(rostime.isLessThan(min, max)).toBe(true);
  });

  it("has greaterThan functionality", () => {
    const min = { sec: 0, nsec: 0 };
    const oneNano = { sec: 0, nsec: 1 };
    const max = { sec: 1, nsec: 1 };
    expect(rostime.isGreaterThan(min, min)).toBe(false);
    expect(rostime.isGreaterThan(max, min)).toBe(true);
    expect(rostime.isGreaterThan(oneNano, min)).toBe(true);
    expect(rostime.isGreaterThan(min, oneNano)).toBe(false);
    expect(rostime.isGreaterThan(min, max)).toBe(false);
  });
});

describe("areEqual", () => {
  it("tests for sameness", () => {
    const min = { sec: 0, nsec: 0 };
    const min2 = { sec: 0, nsec: 0 };
    const oneNano = { sec: 0, nsec: 1 };
    expect(min === min2).toBe(false);
    expect(rostime.areEqual(min, min2)).toBe(true);
    expect(rostime.areEqual(min, oneNano)).toBe(false);
  });
});
