export type HttpRequest = {
  body: string;
  method?: string;
  url?: string;
  socket?: {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remotePort?: number;
  };
};

export type HttpResponse = {
  statusCode: number;
  statusMessage?: string;
  headers?: Record<string, string>;
  body?: string;
  shouldKeepAlive?: boolean;
};

export type HttpHandler = (req: HttpRequest) => Promise<HttpResponse>;

export interface HttpServer {
  handler: HttpHandler;

  url(): string | undefined;

  port(): number | undefined;

  listen(port?: number, hostname?: string, backlog?: number): Promise<void>;

  close(): void;
}
