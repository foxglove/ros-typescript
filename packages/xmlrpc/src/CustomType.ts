import { create as createXml } from "xmlbuilder2";

// Derive XMLBuilder type from createXml return type
type XMLBuilder = ReturnType<typeof createXml>;

export class CustomType {
  tagName = "customType";

  constructor(public raw: string) {}

  serialize(xml: XMLBuilder): XMLBuilder {
    return xml.ele(this.tagName).txt(this.raw);
  }
}
