import { Duration, Time } from "@foxglove/rostime";

export enum QosPolicyDurability {
  SystemDefault = 0,
  TransientLocal = 1,
  Volatile = 2,
  Unknown = 3,
}

export enum QosPolicyHistory {
  SystemDefault = 0,
  KeepLast = 1,
  KeepAll = 2,
  Unknown = 3,
}

export enum QosPolicyLiveliness {
  SystemDefault = 0,
  Automatic = 1,
  ManualByTopic = 3,
  Unknown = 4,
}

export enum QosPolicyReliability {
  SystemDefault = 0,
  Reliable = 1,
  BestEffort = 2,
  Unknown = 3,
}

export type Message = {
  topic: Readonly<TopicDefinition>;
  timestamp: Time;
  data: Uint8Array;
  value: unknown;
};

export type MessageReadOptions = {
  topics?: string[];
  startTime?: Time;
  endTime?: Time;
  rawMessages?: boolean;
};

// Topic and Message interfaces

export type QosProfile = {
  history: QosPolicyHistory;
  depth: number;
  reliability: QosPolicyReliability;
  durability: QosPolicyDurability;
  deadline?: Duration;
  lifespan?: Duration;
  liveliness: QosPolicyLiveliness;
  livelinessLeaseDuration?: Duration;
  avoidRosNamespaceConventions: boolean;
};

export type TopicDefinition = {
  name: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  serializationFormat: "cdr" | string;
  offeredQosProfiles: QosProfile[];
};

export type RawMessage = {
  topic: Readonly<TopicDefinition>;
  timestamp: Time;
  data: Uint8Array;
};

// Sqlite interfaces

export interface SqliteDb {
  open(): Promise<void>;
  close(): Promise<void>;
  readTopics(): Promise<TopicDefinition[]>;
  readMessages(opts: MessageReadOptions): AsyncIterableIterator<RawMessage>;
  timeRange(): Promise<[min: Time, max: Time]>;
  messageCounts(): Promise<Map<string, number>>;
}
