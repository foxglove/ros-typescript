import { XmlRpcClient, XmlRpcFault, XmlRpcValue } from "@foxglove/xmlrpc";

import { RosXmlRpcResponse, RosXmlRpcResponseOrFault } from "./XmlRpcTypes.js";

export class RosXmlRpcClient {
  private _client: XmlRpcClient;

  constructor(url: string) {
    this._client = new XmlRpcClient(url, { encoding: "utf-8" });
  }

  url(): string {
    return this._client.url;
  }

  protected _methodCall = async (
    methodName: string,
    args: XmlRpcValue[],
  ): Promise<RosXmlRpcResponse> => {
    const res = await this._client.methodCall(methodName, args);
    if (!Array.isArray(res) || res.length !== 3) {
      throw new Error(`Malformed XML-RPC response`);
    }

    const [code, msg] = res;
    if (typeof code !== "number" || typeof msg !== "string") {
      // workaround for https://github.com/typescript-eslint/typescript-eslint/issues/10632
      throw new Error(`Invalid code/msg, code="${code as string}", msg="${msg as string}"`);
    }
    return res as RosXmlRpcResponse;
  };

  protected _multiMethodCall = async (
    requests: { methodName: string; params: XmlRpcValue[] }[],
  ): Promise<RosXmlRpcResponseOrFault[]> => {
    const res = await this._client.multiMethodCall(requests);

    const output: RosXmlRpcResponseOrFault[] = [];
    for (const entry of res) {
      if (entry instanceof XmlRpcFault) {
        output.push(entry);
      } else if (!Array.isArray(entry) || entry.length !== 3) {
        throw new Error(`Malformed XML-RPC multicall response`);
      } else {
        const [code, msg] = entry;
        if (typeof code !== "number" || typeof msg !== "string") {
          // workaround for https://github.com/typescript-eslint/typescript-eslint/issues/10632
          throw new Error(`Invalid code/msg, code="${code as string}", msg="${msg as string}"`);
        }
        output.push(entry as RosXmlRpcResponse);
      }
    }
    return output;
  };
}
