/* eslint-disable jest/no-conditional-expect */
import { Rosbag2 } from "@foxglove/rosbag2";
import { Time, isGreaterThan, isTimeInRangeInclusive } from "@foxglove/rostime";
import path from "path";

import { openNodejsFile, openNodejsDirectory } from "./open.js";

const BAG_START: Time = { sec: 1585866235, nsec: 112411371 };
const BAG_END: Time = { sec: 1585866239, nsec: 643508139 };
const TOPICS = ["/rosout", "/topic"];
const DATATYPES = ["rcl_interfaces/msg/Log", "std_msgs/msg/String"];

describe("SqliteNodejs single bag file handling", () => {
  it("reads messages", async () => {
    const bagFilename = path.join(__dirname, "..", "tests", "bags", "talker", "talker.db3");
    const bag = await openNodejsFile(bagFilename);

    let seenRosout = false;
    let seenTopic = false;
    let prevTime: Time = { sec: 0, nsec: 0 };
    for await (const msg of bag.readMessages()) {
      expect(isTimeInRangeInclusive(msg.timestamp, BAG_START, BAG_END)).toEqual(true);
      expect(isGreaterThan(msg.timestamp, prevTime)).toEqual(true);
      expect(TOPICS.includes(msg.topic.name)).toEqual(true);
      expect(DATATYPES.includes(msg.topic.type)).toEqual(true);
      if (!seenRosout && msg.topic.name === "/rosout") {
        seenRosout = true;
        expect(msg.value).toEqual({
          stamp: { sec: 1585866235, nanosec: 112130688 },
          level: 20,
          name: "minimal_publisher",
          msg: "Publishing: 'Hello, world! 0'",
          file: "/opt/ros2_ws/eloquent/src/ros2/examples/rclcpp/minimal_publisher/lambda.cpp",
          function: "operator()",
          line: 38,
        });
        expect(msg.data.byteLength).toBe(176);
      } else if (!seenTopic && msg.topic.name === "/topic") {
        seenTopic = true;
        expect(msg.value).toEqual({ data: "Hello, world! 0" });
        expect(msg.data.byteLength).toBe(24);
      }
      prevTime = msg.timestamp;
    }
  });

  it("reads messages with sec,nsec time type", async () => {
    const bagFilename = path.join(__dirname, "..", "tests", "bags", "talker", "talker.db3");
    const bag = await openNodejsFile(bagFilename, { timeType: "sec,nsec" });

    for await (const msg of bag.readMessages()) {
      if (msg.topic.name !== "/rosout") {
        continue;
      }
      expect(msg.value).toEqual({
        stamp: { sec: 1585866235, nsec: 112130688 },
        level: 20,
        name: "minimal_publisher",
        msg: "Publishing: 'Hello, world! 0'",
        file: "/opt/ros2_ws/eloquent/src/ros2/examples/rclcpp/minimal_publisher/lambda.cpp",
        function: "operator()",
        line: 38,
      });
      expect(msg.data.byteLength).toBe(176);
      break;
    }
  });

  it("reads start/end times", async () => {
    const bagFilename = path.join(__dirname, "..", "tests", "bags", "talker", "talker.db3");
    const bag = await openNodejsFile(bagFilename);

    const [startTime, endTime] = await bag.timeRange();
    expect(startTime).toEqual(BAG_START);
    expect(endTime).toEqual(BAG_END);
  });

  it("reads the topic list", async () => {
    const bagFilename = path.join(__dirname, "..", "tests", "bags", "talker", "talker.db3");
    const bag = await openNodejsFile(bagFilename);

    const topics = await bag.readTopics();
    expect(topics.length).toEqual(3);
    expect(topics[0]!.name).toEqual("/rosout");
    expect(topics[1]!.name).toEqual("/parameter_events");
    expect(topics[2]!.name).toEqual("/topic");
  });

  it("reads message counts", async () => {
    const bagFilename = path.join(__dirname, "..", "tests", "bags", "talker", "talker.db3");
    const bag = await openNodejsFile(bagFilename);

    const counts = await bag.messageCounts();
    expect(counts.size).toEqual(2);
    expect(counts.get("/rosout")).toEqual(10);
    expect(counts.get("/topic")).toEqual(10);
  });
});

describe("SqliteNodejs single bag directory handling", () => {
  it("does not fail on an empty set", async () => {
    const bag = new Rosbag2([]);
    await expect(bag.open()).resolves.toBeUndefined();
  });

  it("reads messages", async () => {
    const bagPath = path.join(__dirname, "..", "tests", "bags", "talker");
    const bag = await openNodejsDirectory(bagPath);

    let seenRosout = false;
    let seenTopic = false;
    let prevTime: Time = { sec: 0, nsec: 0 };
    for await (const msg of bag.readMessages()) {
      expect(isTimeInRangeInclusive(msg.timestamp, BAG_START, BAG_END)).toEqual(true);
      expect(isGreaterThan(msg.timestamp, prevTime)).toEqual(true);
      expect(TOPICS.includes(msg.topic.name)).toEqual(true);
      expect(DATATYPES.includes(msg.topic.type)).toEqual(true);
      if (!seenRosout && msg.topic.name === "/rosout") {
        seenRosout = true;
        expect(msg.value).toEqual({
          stamp: { sec: 1585866235, nanosec: 112130688 },
          level: 20,
          name: "minimal_publisher",
          msg: "Publishing: 'Hello, world! 0'",
          file: "/opt/ros2_ws/eloquent/src/ros2/examples/rclcpp/minimal_publisher/lambda.cpp",
          function: "operator()",
          line: 38,
        });
        expect(msg.data.byteLength).toBe(176);
      } else if (!seenTopic && msg.topic.name === "/topic") {
        seenTopic = true;
        expect(msg.value).toEqual({ data: "Hello, world! 0" });
        expect(msg.data.byteLength).toBe(24);
      }
      prevTime = msg.timestamp;
    }
  });

  it("reads messages with sec,nsec time type", async () => {
    const bagPath = path.join(__dirname, "..", "tests", "bags", "talker");
    const bag = await openNodejsDirectory(bagPath, { timeType: "sec,nsec" });

    for await (const msg of bag.readMessages()) {
      if (msg.topic.name !== "/rosout") {
        continue;
      }
      expect(msg.value).toEqual({
        stamp: { sec: 1585866235, nsec: 112130688 },
        level: 20,
        name: "minimal_publisher",
        msg: "Publishing: 'Hello, world! 0'",
        file: "/opt/ros2_ws/eloquent/src/ros2/examples/rclcpp/minimal_publisher/lambda.cpp",
        function: "operator()",
        line: 38,
      });
      expect(msg.data.byteLength).toBe(176);
      break;
    }
  });

  it("reads start/end times", async () => {
    const bagPath = path.join(__dirname, "..", "tests", "bags", "talker");
    const bag = await openNodejsDirectory(bagPath);

    const [startTime, endTime] = await bag.timeRange();
    expect(startTime).toEqual(BAG_START);
    expect(endTime).toEqual(BAG_END);
  });

  it("reads the topic list", async () => {
    const bagPath = path.join(__dirname, "..", "tests", "bags", "talker");
    const bag = await openNodejsDirectory(bagPath);

    const topics = await bag.readTopics();
    expect(topics.length).toEqual(3);
    expect(topics[0]!.name).toEqual("/rosout");
    expect(topics[1]!.name).toEqual("/parameter_events");
    expect(topics[2]!.name).toEqual("/topic");
  });

  it("reads message counts", async () => {
    const bagPath = path.join(__dirname, "..", "tests", "bags", "talker");
    const bag = await openNodejsDirectory(bagPath);

    const counts = await bag.messageCounts();
    expect(counts.size).toEqual(2);
    expect(counts.get("/rosout")).toEqual(10);
    expect(counts.get("/topic")).toEqual(10);
  });
});
