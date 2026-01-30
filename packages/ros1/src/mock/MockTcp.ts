import { EventEmitter } from "eventemitter3";

import { TcpAddress, TcpServer, TcpServerEvents, TcpSocket, TcpSocketEvents } from "../TcpTypes.js";

export class MockTcpSocket extends EventEmitter<TcpSocketEvents> implements TcpSocket {
  private _connected = true;

  async remoteAddress(): Promise<TcpAddress | undefined> {
    return {
      address: "192.168.1.2",
      port: 40000,
      family: this._connected ? "IPv4" : undefined,
    };
  }

  async localAddress(): Promise<TcpAddress | undefined> {
    return this._connected ? { address: "127.0.0.1", port: 30000, family: "IPv4" } : undefined;
  }

  async fd(): Promise<number | undefined> {
    return 1;
  }

  async connected(): Promise<boolean> {
    return this._connected;
  }

  async connect(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    this._connected = false;
  }

  async write(_data: Uint8Array): Promise<void> {
    // no-op
  }

  // eslint-disable-next-line @foxglove/no-boolean-parameters
  async setNoDelay(_noDelay?: boolean): Promise<void> {
    // no-op
  }
}

export class MockTcpServer extends EventEmitter<TcpServerEvents> implements TcpServer {
  listening = true;

  async address(): Promise<TcpAddress | undefined> {
    return this.listening ? { address: "192.168.1.1", port: 20000, family: "IPv4" } : undefined;
  }

  close(): void {
    this.listening = false;
  }
}

export async function TcpListen(_options: {
  host?: string;
  port?: number;
  backlog?: number;
}): Promise<MockTcpServer> {
  return new MockTcpServer();
}

export async function TcpSocketConnect(_options: {
  host: string;
  port: number;
}): Promise<TcpSocket> {
  return new MockTcpSocket();
}
