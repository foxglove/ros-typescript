import { Client } from "./Client";
import { Publication } from "./Publication";

export interface Publisher {
  on(
    eventName: "connection",
    listener: (
      topic: string,
      connectionId: number,
      destinationCallerId: string,
      client: Client,
    ) => void,
  ): this;

  publish(publication: Publication, message: unknown): Promise<void>;

  transportType(): string;

  listening(): boolean;

  close(): void;
}
