import { XmlRpcFault, XmlRpcValue } from "@foxglove/xmlrpc";

export type RosXmlRpcResponse = [code: number, msg: string, value: XmlRpcValue];
export type RosXmlRpcResponseOrFault = RosXmlRpcResponse | XmlRpcFault;
