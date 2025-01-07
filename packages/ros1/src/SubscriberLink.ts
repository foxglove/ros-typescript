import { Client } from "./Client";

export class SubscriberLink {
  readonly connectionId: number;
  destinationCallerId: string;
  client: Client;

  constructor(connectionId: number, destinationCallerId: string, client: Client) {
    this.connectionId = connectionId;
    this.destinationCallerId = destinationCallerId;
    this.client = client;
  }
}
