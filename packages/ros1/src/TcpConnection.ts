import { MessageDefinition } from "@foxglove/message-definition";
import { parse as parseMessageDefinition } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg-serialization";
import { EventEmitter } from "eventemitter3";

import { Connection, ConnectionStats } from "./Connection";
import { LoggerService } from "./LoggerService";
import { RosTcpMessageStream } from "./RosTcpMessageStream";
import { TcpAddress, TcpSocket } from "./TcpTypes";
import { backoff } from "./backoff";

export interface TcpConnectionEvents {
  header: (
    header: Map<string, string>,
    messageDefinition: MessageDefinition[],
    messageReader: MessageReader,
  ) => void;
  message: (msg: unknown, msgData: Uint8Array) => void;
  error: (err: Error) => void;
}

// Implements a subscriber for the TCPROS transport. The actual TCP transport is
// implemented in the passed in `socket` (TcpSocket). A transform stream is used
// internally for parsing the TCPROS message format (4 byte length followed by
// message payload) so "message" events represent one full message each without
// the length prefix. A transform class that meets this requirements is
// implemented in `RosTcpMessageStream`.
export class TcpConnection extends EventEmitter<TcpConnectionEvents> implements Connection {
  retries = 0;

  private _socket: TcpSocket;
  private _address: string;
  private _port: number;
  private _connected = false;
  private _shutdown = false;
  private _transportInfo = "TCPROS not connected [socket -1]";
  private _readingHeader = true;
  private _requestHeader: Map<string, string>;
  private _header = new Map<string, string>();
  private _stats = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    dropEstimate: -1,
  };
  private _transformer = new RosTcpMessageStream();
  private _msgDefinition: MessageDefinition[] = [];
  private _msgReader: MessageReader | undefined;
  private _log?: LoggerService;

  constructor(
    socket: TcpSocket,
    address: string,
    port: number,
    requestHeader: Map<string, string>,
    log?: LoggerService,
  ) {
    super();
    this._socket = socket;
    this._address = address;
    this._port = port;
    this._requestHeader = requestHeader;
    this._log = log;

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    socket.on("connect", this._handleConnect);
    socket.on("close", this._handleClose);
    socket.on("error", this._handleError);
    socket.on("data", this._handleData);

    this._transformer.on("message", this._handleMessage);
  }

  transportType(): string {
    return "TCPROS";
  }

  async remoteAddress(): Promise<TcpAddress | undefined> {
    return await this._socket.remoteAddress();
  }

  async connect(): Promise<void> {
    if (this._shutdown) {
      return;
    }

    this._log?.debug?.(`connecting to ${this.toString()} (attempt ${this.retries})`);

    try {
      await this._socket.connect();
      this._log?.debug?.(`connected to ${this.toString()}`);
    } catch (err) {
      this._log?.warn?.(`${this.toString()} connection failed: ${err}`);
      // _handleClose() will be called, triggering a reconnect attempt
    }
  }

  private _retryConnection(): void {
    if (!this._shutdown) {
      backoff(++this.retries)
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        .then(() => this.connect())
        .catch((err) => {
          // This should never be called, this.connect() is not expected to throw
          this._log?.warn?.(`${this.toString()} unexpected retry failure: ${err}`);
        });
    }
  }

  connected(): boolean {
    return this._connected;
  }

  header(): Map<string, string> {
    return new Map<string, string>(this._header);
  }

  stats(): ConnectionStats {
    return this._stats;
  }

  messageDefinition(): MessageDefinition[] {
    return this._msgDefinition;
  }

  messageReader(): MessageReader | undefined {
    return this._msgReader;
  }

  close(): void {
    this._log?.debug?.(`closing connection to ${this.toString()}`);

    this._shutdown = true;
    this._connected = false;
    this.removeAllListeners();
    this._socket.close().catch((err) => {
      this._log?.warn?.(`${this.toString()} close failed: ${err}`);
    });
  }

  async writeHeader(): Promise<void> {
    const serializedHeader = TcpConnection.SerializeHeader(this._requestHeader);
    const totalLen = 4 + serializedHeader.byteLength;
    this._stats.bytesSent += totalLen;

    const data = new Uint8Array(totalLen);

    // Write the 4-byte length
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(0, serializedHeader.byteLength, true);

    // Copy the serialized header into the final buffer
    data.set(serializedHeader, 4);

    // Write the length and serialized header payload
    return await this._socket.write(data);
  }

  // e.g. "TCPROS connection on port 59746 to [host:34318 on socket 11]"
  getTransportInfo(): string {
    return this._transportInfo;
  }

  override toString(): string {
    return TcpConnection.Uri(this._address, this._port);
  }

  private _getTransportInfo = async (): Promise<string> => {
    const localPort = (await this._socket.localAddress())?.port ?? -1;
    const addr = await this._socket.remoteAddress();
    const fd = (await this._socket.fd()) ?? -1;
    if (addr != null) {
      const { address, port } = addr;
      const host = address.includes(":") ? `[${address}]` : address;
      return `TCPROS connection on port ${localPort} to [${host}:${port} on socket ${fd}]`;
    }
    return `TCPROS not connected [socket ${fd}]`;
  };

  private _handleConnect = async (): Promise<void> => {
    if (this._shutdown) {
      this.close();
      return;
    }

    this._connected = true;
    this.retries = 0;
    this._transportInfo = await this._getTransportInfo();

    try {
      // Write the initial request header. This prompts the publisher to respond
      // with its own header then start streaming messages
      await this.writeHeader();
    } catch (err) {
      this._log?.warn?.(`${this.toString()} failed to write header. reconnecting: ${err}`);
      this.emit("error", new Error(`Header write failed: ${err}`));
      this._retryConnection();
    }
  };

  private _handleClose = (): void => {
    this._connected = false;
    if (!this._shutdown) {
      this._log?.warn?.(`${this.toString()} closed unexpectedly. reconnecting`);
      this.emit("error", new Error("Connection closed unexpectedly"));
      this._retryConnection();
    }
  };

  private _handleError = (err: Error): void => {
    if (!this._shutdown) {
      this._log?.warn?.(`${this.toString()} error: ${err}`);
      this.emit("error", err);
    }
  };

  private _handleData = (chunk: Uint8Array): void => {
    if (this._shutdown) {
      return;
    }

    try {
      this._transformer.addData(chunk);
    } catch (unk) {
      const err = unk instanceof Error ? unk : new Error(unk as string);
      this._log?.warn?.(
        `failed to decode ${chunk.length} byte chunk from tcp publisher ${this.toString()}: ${err}`,
      );
      // Close the socket, the stream is now corrupt
      this._socket.close().catch((closeErr) => {
        this._log?.warn?.(`${this.toString()} close failed: ${closeErr}`);
      });
      this.emit("error", err);
    }
  };

  private _handleMessage = (msgData: Uint8Array): void => {
    if (this._shutdown) {
      this.close();
      return;
    }

    this._stats.bytesReceived += msgData.byteLength;

    if (this._readingHeader) {
      this._readingHeader = false;

      this._header = TcpConnection.ParseHeader(msgData);
      this._msgDefinition = parseMessageDefinition(this._header.get("message_definition") ?? "");
      this._msgReader = new MessageReader(this._msgDefinition);
      this.emit("header", this._header, this._msgDefinition, this._msgReader);
    } else {
      this._stats.messagesReceived++;

      if (this._msgReader != null) {
        try {
          const bytes = new Uint8Array(msgData.buffer, msgData.byteOffset, msgData.length);
          const msg = this._msgReader.readMessage(bytes);
          this.emit("message", msg, msgData);
        } catch (unk) {
          const err = unk instanceof Error ? unk : new Error(unk as string);
          this.emit("error", err);
        }
      }
    }
  };

  static Uri(address: string, port: number): string {
    // RFC2732 requires IPv6 addresses that include ":" characters to be wrapped in "[]" brackets
    // when used in a URI
    const host = address.includes(":") ? `[${address}]` : address;
    return `tcpros://${host}:${port}`;
  }

  static SerializeHeader(header: Map<string, string>): Uint8Array {
    const encoder = new TextEncoder();
    const encoded = Array.from(header).map(([key, value]) => encoder.encode(`${key}=${value}`));
    const payloadLen = encoded.reduce((sum, str) => sum + str.length + 4, 0);
    const buffer = new ArrayBuffer(payloadLen);
    const array = new Uint8Array(buffer);
    const view = new DataView(buffer);

    let idx = 0;
    encoded.forEach((strData) => {
      view.setUint32(idx, strData.length, true);
      idx += 4;
      array.set(strData, idx);
      idx += strData.length;
    });

    return new Uint8Array(buffer);
  }

  static ParseHeader(data: Uint8Array): Map<string, string> {
    const decoder = new TextDecoder();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const result = new Map<string, string>();

    let idx = 0;
    while (idx + 4 < data.length) {
      const len = Math.min(view.getUint32(idx, true), data.length - idx - 4);
      idx += 4;
      const str = decoder.decode(new Uint8Array(data.buffer, data.byteOffset + idx, len));
      let equalIdx = str.indexOf("=");
      if (equalIdx < 0) {
        equalIdx = str.length;
      }
      const key = str.substr(0, equalIdx);
      const value = str.substr(equalIdx + 1);
      result.set(key, value);
      idx += len;
    }

    return result;
  }
}
