import http from "http";

import { HttpHandler, HttpServer } from "../HttpTypes";

export class HttpServerNodejs implements HttpServer {
  handler: HttpHandler;
  private _server: http.Server;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    this.handler = () => Promise.resolve({ statusCode: 404 });
    this._server = new http.Server((req, res) => {
      // Read the full request body into a string
      const chunks: Uint8Array[] = [];
      req.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        const input = { ...req, body };

        // Handle this request
        this.handler(input)
          .then((out) => {
            // Write the HTTP response
            res.shouldKeepAlive = out.shouldKeepAlive ?? res.shouldKeepAlive;
            res.statusCode = out.statusCode;
            res.statusMessage = out.statusMessage ?? "";
            for (const [key, value] of Object.entries(out.headers ?? {})) {
              res.setHeader(key, value);
            }
            res.end(out.body);
          })
          .catch((maybeErr: unknown) => {
            const err = maybeErr as Error;
            const errStr = err.message;
            // Write an HTTP error response
            res.shouldKeepAlive = false;
            res.statusCode = 500;
            res.statusMessage = errStr;
            res.end();
          });
      });
    });
  }

  url(): string | undefined {
    const addr = this._server.address();
    if (addr == undefined || typeof addr === "string") {
      return addr ?? undefined;
    }
    const hostname = addr.address === "::" ? "[::]" : addr.address;
    return `http://${hostname}${addr.port != undefined ? ":" + String(addr.port) : ""}/`;
  }

  port(): number | undefined {
    const addr = this._server.address();
    if (addr == undefined || typeof addr === "string") {
      return undefined;
    }
    return addr.port;
  }

  async listen(port?: number, hostname?: string, backlog?: number): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._server.on("error", reject);
      this._server.listen(port, hostname, backlog, () => {
        this._server.removeListener("error", reject);
        resolve();
      });
    });
  }

  close(): void {
    this._server.close();
  }
}
