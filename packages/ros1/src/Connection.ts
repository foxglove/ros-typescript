import { MessageDefinition } from "@foxglove/message-definition";
import { MessageReader } from "@foxglove/rosmsg-serialization";

export interface ConnectionStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  dropEstimate: number;
}

export interface Connection {
  on(
    eventName: "header",
    listener: (
      header: Map<string, string>,
      msgDef: MessageDefinition[],
      msgReader: MessageReader,
    ) => void,
  ): this;
  on(eventName: "message", listener: (msg: unknown, data: Uint8Array) => void): this;
  on(eventName: "error", listener: (err: Error) => void): this;

  transportType(): string;

  connect(): Promise<void>;

  connected(): boolean;

  header(): Map<string, string>;

  stats(): ConnectionStats;

  messageDefinition(): MessageDefinition[];

  messageReader(): MessageReader | undefined;

  close(): void;

  getTransportInfo(): string;
}
