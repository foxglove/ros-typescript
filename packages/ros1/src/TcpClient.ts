import EventEmitter from "eventemitter3";

import { Client, ClientStats } from "./Client";
import { LoggerService } from "./LoggerService";
import { Publication } from "./Publication";
import { RosTcpMessageStream } from "./RosTcpMessageStream";
import { TcpConnection } from "./TcpConnection";
import { TcpSocket } from "./TcpTypes";

export type PublicationLookup = (topic: string) => Publication | undefined;

type TcpClientOpts = {
  socket: TcpSocket;
  nodeName: string;
  getPublication: PublicationLookup;
  log?: LoggerService;
};

export interface TcpClientEvents {
  close: () => void;
  subscribe: (topic: string, destinationCallerId: string) => void;
  error: (err: Error) => void;
}

export class TcpClient extends EventEmitter<TcpClientEvents> implements Client {
  private _socket: TcpSocket;
  private _address?: string;
  private _port?: number;
  private _transportInfo: string;
  private _nodeName: string;
  private _connected = true;
  private _receivedHeader = false;
  private _stats: ClientStats = { bytesSent: 0, bytesReceived: 0, messagesSent: 0 };
  private _getPublication: PublicationLookup;
  private _log?: LoggerService;
  private _transformer: RosTcpMessageStream;

  constructor({ socket, nodeName, getPublication, log }: TcpClientOpts) {
    super();
    this._socket = socket;
    this._nodeName = nodeName;
    this._getPublication = getPublication;
    this._log = log;
    this._transformer = new RosTcpMessageStream();
    this._transportInfo = `TCPROS establishing connection`;

    socket.on("close", this._handleClose);
    socket.on("error", this._handleError);
    socket.on("data", this._handleData);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this._transformer.on("message", this._handleMessage);

    void this._updateTransportInfo();

    // Wait for the client to send the initial connection header
  }

  transportType(): string {
    return "TCPROS";
  }

  connected(): boolean {
    return this._connected;
  }

  stats(): ClientStats {
    return this._stats;
  }

  async write(data: Uint8Array): Promise<void> {
    try {
      await this._socket.write(data);
      this._stats.messagesSent++;
      this._stats.bytesSent += data.length;
    } catch (err) {
      this._log?.warn?.(`failed to write ${data.length} bytes to ${this.toString()}: ${err}`);
    }
  }

  close(): void {
    this._socket
      .close()
      .catch((err) => this._log?.warn?.(`error closing client socket ${this.toString()}: ${err}`));
  }

  getTransportInfo(): string {
    return this._transportInfo;
  }

  override toString(): string {
    return TcpConnection.Uri(this._address ?? "<unknown>", this._port ?? 0);
  }

  private _updateTransportInfo = async (): Promise<void> => {
    let fd = -1;
    try {
      fd = (await this._socket.fd()) ?? -1;
      const localPort = (await this._socket.localAddress())?.port ?? -1;
      const addr = await this._socket.remoteAddress();
      if (addr == undefined) {
        throw new Error(`Socket ${fd} on local port ${localPort} could not resolve remoteAddress`);
      }

      const { address, port } = addr;
      const host = address.includes(":") ? `[${address}]` : address;
      this._address = address;
      this._port = port;
      this._transportInfo = `TCPROS connection on port ${localPort} to [${host}:${port} on socket ${fd}]`;
    } catch (err) {
      this._transportInfo = `TCPROS not connected [socket ${fd}]`;
      this._log?.warn?.(`Cannot resolve address for tcp connection: ${err}`);
      this.emit("error", new Error(`Cannot resolve address for tcp connection: ${err}`));
    }
  };

  private async _writeHeader(header: Map<string, string>): Promise<void> {
    const data = TcpConnection.SerializeHeader(header);

    // Write the serialized header payload
    const buffer = new ArrayBuffer(4 + data.length);
    const payload = new Uint8Array(buffer);
    const view = new DataView(buffer);
    view.setUint32(0, data.length, true);
    payload.set(data, 4);

    try {
      await this._socket.write(payload);
      this._stats.bytesSent += payload.length;
    } catch (err) {
      this._log?.warn?.(
        `failed to write ${data.length + 4} byte header to ${this.toString()}: ${err}`,
      );
    }
  }

  private _handleClose = () => {
    this._connected = false;
    this.emit("close");
  };

  private _handleError = (err: Error) => {
    this._log?.warn?.(`tcp client ${this.toString()} error: ${err}`);
    this.emit("error", err);
  };

  private _handleData = (chunk: Uint8Array) => {
    try {
      this._transformer.addData(chunk);
    } catch (unk) {
      const err = unk instanceof Error ? unk : new Error(unk as string);
      this._log?.warn?.(
        `failed to decode ${chunk.length} byte chunk from tcp client ${this.toString()}: ${err}`,
      );
      // Close the socket, the stream is now corrupt
      void this._socket.close();
      this.emit("error", err);
    }
  };

  private _handleMessage = async (msgData: Uint8Array) => {
    // Check if we have already received the connection header from this client
    if (this._receivedHeader) {
      this._log?.warn?.(`tcp client ${this.toString()} sent ${msgData.length} bytes after header`);
      this._stats.bytesReceived += msgData.byteLength;
      return;
    }

    const header = TcpConnection.ParseHeader(msgData);
    const topic = header.get("topic");
    const destinationCallerId = header.get("callerid");
    const dataType = header.get("type");
    const md5sum = header.get("md5sum") ?? "*";
    const tcpNoDelay = header.get("tcp_nodelay") === "1";

    this._receivedHeader = true;

    void this._socket.setNoDelay(tcpNoDelay);

    if (topic == undefined || dataType == undefined || destinationCallerId == undefined) {
      this._log?.warn?.(
        `tcp client ${this.toString()} sent incomplete header. topic="${topic}", type="${dataType}", callerid="${destinationCallerId}"`,
      );
      return this.close();
    }

    // Check if we are publishing this topic
    const pub = this._getPublication(topic);
    if (pub == undefined) {
      this._log?.warn?.(
        `tcp client ${this.toString()} attempted to subscribe to unadvertised topic ${topic}`,
      );
      return this.close();
    }

    this._stats.bytesReceived += msgData.byteLength;

    // Check the dataType matches
    if (dataType !== "*" && pub.dataType !== dataType) {
      this._log?.warn?.(
        `tcp client ${this.toString()} attempted to subscribe to topic ${topic} with type "${dataType}", expected "${
          pub.dataType
        }"`,
      );
      return this.close();
    }

    // Check the md5sum matches
    if (md5sum !== "*" && pub.md5sum !== md5sum) {
      this._log?.warn?.(
        `tcp client ${this.toString()} attempted to subscribe to topic ${topic} with md5sum "${md5sum}", expected "${
          pub.md5sum
        }"`,
      );
      return this.close();
    }

    // Write the response header
    void this._writeHeader(
      new Map<string, string>([
        ["callerid", this._nodeName],
        ["latching", pub.latching ? "1" : "0"],
        ["md5sum", pub.md5sum],
        ["message_definition", pub.messageDefinitionText],
        ["topic", pub.name],
        ["type", pub.dataType],
      ]),
    );

    // Immediately send the last published message if latching is enabled
    const latched = pub.latchedMessage(this.transportType());
    if (latched != undefined) {
      void this.write(latched);
    }

    this.emit("subscribe", topic, destinationCallerId);
  };
}
