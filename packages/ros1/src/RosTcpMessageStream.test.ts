import { RosTcpMessageStream } from "./RosTcpMessageStream";

describe("RosTcpMessageStream", () => {
  it("decodes an empty message", () => {
    const stream = new RosTcpMessageStream();

    let curMsg: Uint8Array | undefined;
    stream.on("message", (msg) => (curMsg = msg));

    stream.addData(new Uint8Array());
    expect(curMsg).toBeUndefined();

    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toEqual(new Uint8Array());
  });

  it("decodes small messages", () => {
    const stream = new RosTcpMessageStream();

    let curMsg: Uint8Array | undefined;
    stream.on("message", (msg) => (curMsg = msg));

    stream.addData(new Uint8Array());
    expect(curMsg).toBeUndefined();

    stream.addData(new Uint8Array([1]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([42]));
    expect(curMsg).toEqual(new Uint8Array([42]));
    curMsg = undefined;

    stream.addData(new Uint8Array([2]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0, 0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0, 43, 44]));
    expect(curMsg).toEqual(new Uint8Array([43, 44]));
    curMsg = undefined;

    stream.addData(new Uint8Array([3]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0]));
    expect(curMsg).toBeUndefined();
    stream.addData(new Uint8Array([0, 0, 45]));
    stream.addData(new Uint8Array([46, 47, 1]));
    expect(curMsg).toEqual(new Uint8Array([45, 46, 47]));
    curMsg = undefined;

    stream.addData(new Uint8Array([0, 0, 0, 48, 0]));
    expect(curMsg).toEqual(new Uint8Array([48]));
    curMsg = undefined;

    stream.addData(new Uint8Array([0, 0, 0]));
    expect(curMsg).toEqual(new Uint8Array([]));
  });

  it("fails on invalid stream data", () => {
    // 1000000001 === 0x3B9ACA01
    expect(() => {
      new RosTcpMessageStream().addData(new Uint8Array([0x01, 0xca, 0x9a, 0x3b]));
    }).toThrow();
    expect(() => {
      new RosTcpMessageStream().addData(new Uint8Array([0x00, 0xca, 0x9a, 0x3b]));
    }).not.toThrow();
  });
});
