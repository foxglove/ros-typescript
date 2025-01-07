import { parse } from "@foxglove/rosmsg";
import benny from "benny";

import { Testcase, testCases } from "./testCases";
import { LazyMessageReader, MessageReader, MessageWriter } from "../src";

async function makeSuite(testCase: Testcase): Promise<void> {
  const name = testCase.name;
  const msgDefStr = testCase.msgDef;
  const messageDefinition = parse(msgDefStr);

  const writer = new MessageWriter(messageDefinition);
  const msgData = writer.writeMessage(testCase.msg);
  const lastField = testCase.lastField;

  await benny.suite(
    `${name} - new reader`,

    benny.add("Reg", () => {
      new MessageReader(messageDefinition);
    }),

    benny.add("Lazy", () => {
      new LazyMessageReader(messageDefinition);
    }),

    benny.cycle(),
    benny.complete(),
  );

  await benny.suite(
    `${name} - read message`,

    benny.add("Reg", () => {
      const messageReader = new MessageReader(messageDefinition);
      return () => {
        messageReader.readMessage(msgData);
      };
    }),

    benny.add("Lazy", () => {
      const messageReader = new LazyMessageReader(messageDefinition);
      return () => {
        messageReader.readMessage(msgData);
      };
    }),

    benny.add("Lazy - w/toObject", () => {
      const messageReader = new LazyMessageReader(messageDefinition);
      return () => {
        const msg = messageReader.readMessage(msgData);
        msg.toObject();
      };
    }),

    benny.cycle(),
    benny.complete(),
  );

  await benny.suite(
    `${name} - read last field`,

    benny.add("Reg", () => {
      const messageReader = new MessageReader(messageDefinition);
      return () => {
        // for regular message reading the last field can only be accessed once the message is read
        const msg = messageReader.readMessage(msgData);
        lastField(msg);
      };
    }),

    benny.add("Lazy", () => {
      const messageReader = new LazyMessageReader(messageDefinition);
      return () => {
        const msg = messageReader.readMessage(msgData);
        lastField(msg);
      };
    }),

    benny.cycle(),
    benny.complete(),
  );

  console.log("---------------------------------------");
}

async function main() {
  for (const testCase of testCases) {
    await makeSuite(testCase);
  }
}

void main();
