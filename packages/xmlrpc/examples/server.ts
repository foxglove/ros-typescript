import { XmlRpcFault, XmlRpcServer, XmlRpcValue } from "@foxglove/xmlrpc";
import { HttpServerNodejs } from "@foxglove/xmlrpc/nodejs";

async function main() {
  const xmlrpc = new XmlRpcServer(new HttpServerNodejs());
  xmlrpc.setHandler("sum", async (_methodName, args): Promise<XmlRpcValue> => {
    if (args.length !== 2 || typeof args[0] !== "number" || typeof args[1] !== "number") {
      throw new XmlRpcFault("Usage: sum(a: number, b: number): number");
    }
    const [a, b] = args;
    const res = a + b;
    console.debug(`sum(${a}, ${b}) -> ${res}`);
    return [res];
  });
  await xmlrpc.listen(8000);
  const url = xmlrpc.server.url() ?? "http://localhost:8000";
  console.info(`Listening on ${url}`);
  console.log(
    `Try running: curl --data "<methodCall><methodName>sum</methodName><params><param><value><int>3</int></value></param><param><value><int>4</int></value></param></params></methodCall>" ${url}`,
  );
}

void main();
