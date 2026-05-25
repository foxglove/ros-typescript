import { stringLengthUtf8 } from "./stringLengthUtf8";

describe("stringLengthUtf8", () => {
  it("does not include an implicit null terminator", () => {
    expect(stringLengthUtf8("")).toEqual(0);
    expect(stringLengthUtf8("BLUE")).toEqual(4);
    expect(stringLengthUtf8("BLUE\u0000")).toEqual(5);
  });

  it.each([
    "",
    "a",
    "ab",
    "abc",
    "abcd",
    "béta",
    "\xE9",
    "\u0000",
    "\u007f",
    "\u0080",
    "\u07ff",
    "\u0800",
    "\ud800", // lone high surrogate
    "\ud800x", // lone high surrogate
    "x\ud800", // lone high surrogate
    "\ud800\udc00", // surrogate pair, equivalent to "𐀀" or "\u{10000}"
    "\udbff\udfff", // surrogate pair, equivalent to "\u{10ffff}"
    "\udc00", // lone low surrogate
    "\udc00x", // lone low surrogate
    "x\udc00", // lone low surrogate
    "\u7fff",
    "\u8000",
    "\u8001",
    "\uffff",
    "\u{10000}",
    "\u{fffff}",
    "\u{100000}",
    "\u{10ffff}",
  ])("agrees with TextEncoder", (str) => {
    expect(stringLengthUtf8(str)).toEqual(new TextEncoder().encode(str).length);
  });
});
