import { RosMaster } from "./RosMaster.js";
import { MockHttpServer } from "./mock/MockHttpServer.js";

const CALLER_ID1 = "/test1";
const CALLER_API1 = "http://127.0.0.1:1111/";

const CALLER_ID2 = "/test2";
const CALLER_API2 = "http://127.0.0.1:1112/";

describe("RosMaster", () => {
  it("registers publishers", async () => {
    const rosMaster = new RosMaster(new MockHttpServer("127.0.0.1", 11311));
    let res = await rosMaster.registerPublisher("registerPublisher", [
      CALLER_ID1,
      "/a",
      "testType",
      CALLER_API1,
    ]);
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(3);

    const [status, msg, subscribers] = res;
    expect(status).toEqual(1);
    expect(typeof msg).toBe("string");
    expect(Array.isArray(subscribers)).toBe(true);
    expect(subscribers).toHaveLength(0);

    res = await rosMaster.registerSubscriber("registerSubscriber", [
      CALLER_ID2,
      "/a",
      "testType",
      CALLER_API2,
    ]);
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(3);

    const [status2, msg2, publishers] = res;
    expect(status2).toEqual(1);
    expect(typeof msg2).toBe("string");
    expect(Array.isArray(publishers)).toBe(true);
    expect(publishers).toEqual([CALLER_API1]);

    rosMaster.close();
  });
});
