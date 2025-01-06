export interface ClientStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
}

export interface Client {
  on(eventName: "close", listener: () => void): this;
  on(eventName: "subscribe", listener: (topic: string, destinationCallerId: string) => void): this;

  transportType(): string;

  connected(): boolean;

  stats(): ClientStats;

  write(data: Uint8Array): Promise<void>;

  close(): void;

  getTransportInfo(): string;

  toString(): string;
}
