import type { Message, RawMessage } from "./types";

type MessageDecoder = (rawMessage: RawMessage) => unknown;

/**
 * MessageIterator is a helper class to convert raw table rows into Message instances as an
 * asynchronous iterator.
 */
export class MessageIterator implements AsyncIterableIterator<Message> {
  // eslint-disable-next-line @foxglove/prefer-hash-private
  private rowIterators: AsyncIterableIterator<RawMessage>[];
  // eslint-disable-next-line @foxglove/prefer-hash-private
  private decoder?: MessageDecoder;

  public constructor(rowIterators: AsyncIterableIterator<RawMessage>[], decoder?: MessageDecoder) {
    this.rowIterators = rowIterators;
    this.decoder = decoder;
  }

  public [Symbol.asyncIterator](): AsyncIterableIterator<Message> {
    return this;
  }

  public async next(): Promise<IteratorResult<Message>> {
    while (this.rowIterators.length > 0) {
      const front = this.rowIterators[0]!;
      const res = await front.next();
      if (res.done === true) {
        this.rowIterators.shift();
        continue;
      }

      const rawMessage = res.value;
      const { topic, timestamp, data } = rawMessage;
      if (this.decoder == undefined) {
        return { value: { topic, timestamp, data, value: undefined }, done: false };
      }

      const value: Message = { topic, timestamp, data, value: this.decoder(rawMessage) };
      return { value, done: false };
    }

    return { value: undefined, done: true };
  }
}
