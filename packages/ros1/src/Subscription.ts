import { MessageDefinition } from "@foxglove/message-definition";
import { MessageReader } from "@foxglove/rosmsg-serialization";
import { EventEmitter } from "eventemitter3";

import { Connection } from "./Connection.js";
import { PublisherLink } from "./PublisherLink.js";
import { RosFollowerClient } from "./RosFollowerClient.js";

type PublisherStats = [
  connectionId: number,
  bytesReceived: number,
  messagesReceived: number,
  estimatedDrops: number,
  connected: 0,
];

// e.g. [1, "http://host:54893/", "i", "TCPROS", "/chatter", 1, "TCPROS connection on port 59746 to [host:34318 on socket 11]"]
type PublisherInfo = [
  connectionId: number,
  publisherXmlRpcUri: string,
  direction: "i",
  transport: string,
  topicName: string,
  connected: number,
  connectionInfo: string,
];

type SubscriptionOpts = {
  name: string;
  md5sum: string;
  dataType: string;
  tcpNoDelay: boolean;
};

export interface SubscriptionEvents {
  header: (
    header: Map<string, string>,
    msgDef: MessageDefinition[],
    msgReader: MessageReader,
  ) => void;
  message: (msg: unknown, data: Uint8Array, publisher: PublisherLink) => void;
  error: (err: Error) => void;
}

export class Subscription extends EventEmitter<SubscriptionEvents> {
  readonly name: string;
  readonly md5sum: string;
  readonly dataType: string;
  readonly tcpNoDelay: boolean;
  private _publishers = new Map<number, PublisherLink>();

  constructor({ name, md5sum, dataType, tcpNoDelay }: SubscriptionOpts) {
    super();
    this.name = name;
    this.md5sum = md5sum;
    this.dataType = dataType;
    this.tcpNoDelay = tcpNoDelay;
  }

  close(): void {
    this.removeAllListeners();
    for (const pub of this._publishers.values()) {
      pub.connection.close();
    }
    this._publishers.clear();
  }

  publishers(): Readonly<Map<number, PublisherLink>> {
    return this._publishers;
  }

  addPublisher(
    connectionId: number,
    rosFollowerClient: RosFollowerClient,
    connection: Connection,
  ): void {
    const publisher = new PublisherLink(connectionId, this, rosFollowerClient, connection);
    this._publishers.set(connectionId, publisher);

    connection.on("header", (header, def, reader) => this.emit("header", header, def, reader));
    connection.on("message", (msg, data) => this.emit("message", msg, data, publisher));
    connection.on("error", (err) => this.emit("error", err));
  }

  removePublisher(connectionId: number): boolean {
    this._publishers.get(connectionId)?.connection.close();
    return this._publishers.delete(connectionId);
  }

  getInfo(): PublisherInfo[] {
    return Array.from(this._publishers.values()).map((pub): PublisherInfo => {
      return [
        pub.connectionId,
        pub.publisherXmlRpcUrl().toString(),
        "i",
        pub.connection.transportType(),
        this.name,
        1,
        pub.connection.getTransportInfo(),
      ];
    });
  }

  getStats(): [string, PublisherStats[]] {
    const pubStats = Array.from(this._publishers.values()).map((pub): PublisherStats => {
      const stats = pub.connection.stats();
      return [pub.connectionId, stats.bytesReceived, stats.messagesReceived, stats.dropEstimate, 0];
    });
    return [this.name, pubStats];
  }

  receivedBytes(): number {
    let bytes = 0;
    for (const pub of this._publishers.values()) {
      bytes += pub.connection.stats().bytesReceived;
    }
    return bytes;
  }
}
