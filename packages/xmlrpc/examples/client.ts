import { XmlRpcClient } from "@foxglove/xmlrpc";

async function main() {
  const a = parseInt(process.argv[2] ?? "1");
  const b = parseInt(process.argv[3] ?? "2");
  const client = new XmlRpcClient(`http://localhost:8000`);
  const res = await client.methodCall("sum", [a, b]);
  console.log(`sum(${a}, ${b}) -> ${String(res)}`);
}

void main();
