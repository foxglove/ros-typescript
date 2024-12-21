import { foo } from "./index";

describe("foo", () => {
  it("returns a value", () => {
    expect(foo()).toEqual(42);
  });
});
