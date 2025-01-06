import { HttpHandler, HttpServer } from "@foxglove/xmlrpc";

export class MockHttpServer implements HttpServer {
  handler: HttpHandler = async (_req) => ({ statusCode: 404 });

  private _port?: number;
  private _hostname?: string;
  private _defaultHost: string;
  private _defaultPort: number;

  constructor(defaultHost: string, defaultPort: number) {
    this._defaultHost = defaultHost;
    this._defaultPort = defaultPort;
  }

  url(): string | undefined {
    if (this._hostname == undefined || this._port == undefined) {
      return undefined;
    }
    return `http://${this._hostname}:${this._port}/`;
  }

  port(): number | undefined {
    return this._port;
  }

  async listen(port?: number, hostname?: string, _backlog?: number): Promise<void> {
    this._port = port ?? this._defaultPort;
    this._hostname = hostname ?? this._defaultHost;
  }

  close(): void {
    this._port = undefined;
    this._hostname = undefined;
  }
}
