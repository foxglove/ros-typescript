import { concatData } from "./concatData.js";

describe("concatData", () => {
  it("concatData works", () => {
    expect(concatData([])).toEqual(new Uint8Array());
    expect(concatData([new Uint8Array([1, 2, 3])])).toEqual(new Uint8Array([1, 2, 3]));
    expect(concatData([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])])).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
    expect(
      concatData([
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array(),
        new Uint8Array([7]),
      ]),
    ).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
  });
});
