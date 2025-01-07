import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";

export class CustomType {
  tagName = "customType";

  constructor(public raw: string) {}

  serialize(xml: XMLBuilder): XMLBuilder {
    return xml.ele(this.tagName).txt(this.raw);
  }
}
