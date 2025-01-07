import type { MessageDefinition } from "@foxglove/message-definition";
import { ros2galactic } from "@foxglove/rosmsg-msgs-common";
import { MessageReader, MessageReaderOptions } from "@foxglove/rosmsg2-serialization";
import { Time, isLessThan as isTimeLessThan } from "@foxglove/rostime";
import { foxgloveMessageSchemas, generateRosMsgDefinition } from "@foxglove/schemas/internal";

import { MessageIterator } from "./MessageIterator";
import { Message, MessageReadOptions, RawMessage, SqliteDb, TopicDefinition } from "./types";

export const ROS2_TO_DEFINITIONS = new Map<string, MessageDefinition>();
export const ROS2_DEFINITIONS_ARRAY: MessageDefinition[] = [];

// Add ROS2 common message definitions (rcl_interfaces, common_interfaces, etc)
for (const [dataType, msgdef] of Object.entries(ros2galactic)) {
  ROS2_DEFINITIONS_ARRAY.push(msgdef);

  // Handle the datatype naming difference used in rosbag2 (but not the .msg files)
  ROS2_TO_DEFINITIONS.set(dataTypeToFullName(dataType), msgdef);
}

// Add foxglove message definitions
for (const schema of Object.values(foxgloveMessageSchemas)) {
  const { rosMsgInterfaceName, rosFullInterfaceName, fields } = generateRosMsgDefinition(schema, {
    rosVersion: 2,
  });
  const msgdef: MessageDefinition = { name: rosMsgInterfaceName, definitions: fields };
  if (!ROS2_TO_DEFINITIONS.has(rosFullInterfaceName)) {
    ROS2_DEFINITIONS_ARRAY.push(msgdef);
    ROS2_TO_DEFINITIONS.set(rosFullInterfaceName, msgdef);
  }
}

// Add the legacy foxglove_msgs/ImageMarkerArray message definition
const imageMarkerArray: MessageDefinition = {
  name: "foxglove_msgs/ImageMarkerArray",
  definitions: [
    { type: "visualization_msgs/ImageMarker", isArray: true, name: "markers", isComplex: true },
  ],
};
ROS2_DEFINITIONS_ARRAY.push(imageMarkerArray);
ROS2_TO_DEFINITIONS.set("foxglove_msgs/msg/ImageMarkerArray", imageMarkerArray);

export class Rosbag2 {
  #messageReaders = new Map<string, MessageReader>();
  #databases: SqliteDb[];
  #messageReaderOptions?: MessageReaderOptions;

  public constructor(files: SqliteDb[], messageReaderOptions?: MessageReaderOptions) {
    this.#databases = files;
    this.#messageReaderOptions = messageReaderOptions;
  }

  public async open(): Promise<void> {
    for (const db of this.#databases) {
      await db.open();
    }
  }

  public async close(): Promise<void> {
    for (const db of this.#databases) {
      await db.close();
    }
    this.#databases = [];
  }

  public async readTopics(): Promise<TopicDefinition[]> {
    if (this.#databases.length === 0) {
      return [];
    }

    const firstDb = this.#databases[0]!;
    return await firstDb.readTopics();
  }

  public readMessages(opts: MessageReadOptions = {}): AsyncIterableIterator<Message> {
    if (this.#databases.length === 0) {
      return new MessageIterator([]);
    }

    const rowIterators = this.#databases.map((db) => db.readMessages(opts));
    return new MessageIterator(
      rowIterators,
      opts.rawMessages !== true ? this.#decodeMessage : undefined,
    );
  }

  public async timeRange(): Promise<[min: Time, max: Time]> {
    if (this.#databases.length === 0) {
      return [
        { sec: 0, nsec: 0 },
        { sec: 0, nsec: 0 },
      ];
    }

    let min = { sec: Number.MAX_SAFE_INTEGER, nsec: 0 };
    let max = { sec: Number.MIN_SAFE_INTEGER, nsec: 0 };
    for (const db of this.#databases) {
      const [curMin, curMax] = await db.timeRange();
      min = minTime(min, curMin);
      max = maxTime(max, curMax);
    }
    return [min, max];
  }

  public async messageCounts(): Promise<Map<string, number>> {
    const allCounts = new Map<string, number>();
    if (this.#databases.length === 0) {
      return allCounts;
    }

    for (const db of this.#databases) {
      const counts = await db.messageCounts();
      for (const [topic, count] of counts) {
        allCounts.set(topic, (allCounts.get(topic) ?? 0) + count);
      }
    }
    return allCounts;
  }

  #decodeMessage = (rawMessage: RawMessage): unknown => {
    // Find or create a message reader for this message
    let reader = this.#messageReaders.get(rawMessage.topic.type);
    if (reader == undefined) {
      const msgdef = ROS2_TO_DEFINITIONS.get(rawMessage.topic.type);
      if (msgdef == undefined) {
        throw new Error(`Unknown message type: ${rawMessage.topic.type}`);
      }
      reader = new MessageReader([msgdef, ...ROS2_DEFINITIONS_ARRAY], this.#messageReaderOptions);
      this.#messageReaders.set(rawMessage.topic.type, reader);
    }

    return reader.readMessage(rawMessage.data);
  };
}

function minTime(a: Time, b: Time): Time {
  return isTimeLessThan(a, b) ? a : b;
}

function maxTime(a: Time, b: Time): Time {
  return isTimeLessThan(a, b) ? b : a;
}

function dataTypeToFullName(dataType: string): string {
  const parts = dataType.split("/");
  if (parts.length === 2) {
    return `${parts[0]!}/msg/${parts[1]!}`;
  }
  return dataType;
}
