export class XmlRpcFault extends Error {
  code?: number;
  faultCode?: number;
  faultString?: string;

  constructor(faultString?: string, faultCode?: number) {
    const msg = `XML-RPC fault${faultString != undefined ? ": " + faultString : ""}`;
    super(msg);

    this.code = this.faultCode = faultCode;
    this.faultString = faultString;
  }
}
