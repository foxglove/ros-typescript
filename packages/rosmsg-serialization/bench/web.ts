import { parse } from "@foxglove/rosmsg";

import { testCases } from "./testCases";
import { LazyMessageReader, MessageReader, MessageWriter } from "../src";

const Iterations = 10_000;

type BenchCase = {
  name: string;
  benchCase: () => void;
};

function output(msg: string) {
  document.querySelector("main")!.innerHTML += msg;
}

function runCases(label: string, benchCases: BenchCase[]) {
  const results: { name: string; length: number }[] = [];
  for (const benchCase of benchCases) {
    const start = performance.now();
    for (let i = 0; i < Iterations; i++) {
      benchCase.benchCase();
    }
    const length = performance.now() - start;
    results.push({ name: benchCase.name, length });
  }

  const sorted = [...results].sort((a, b) => a.length - b.length);

  const resultsString = results
    .map((result) => {
      const ratio = sorted[0].length / result.length;
      const isBestClass = result.length === sorted[0].length ? "best" : "not-best";

      return `
        <div class=${isBestClass}>${result.name}</div>
        <div>${result.length.toFixed(2)}</div>
        <div>${ratio.toFixed(2)}</div>
        `;
    })
    .join("");

  output(
    `
    <h2>${label}</h2>
    ${resultsString}
    `,
  );
}

async function main() {
  document.querySelector("main")!.innerHTML = "";

  for (const testCase of testCases) {
    const name = testCase.name;
    const msgDefStr = testCase.msgDef;
    const messageDefinition = parse(msgDefStr);

    const writer = new MessageWriter(messageDefinition);
    const msgData = writer.writeMessage(testCase.msg);
    const lastField = testCase.lastField;

    output(`<h1>${name}</h1>`);

    runCases("create", [
      {
        name: "reg",
        benchCase: () => {
          new MessageReader(messageDefinition);
        },
      },
      {
        name: "lazy",
        benchCase: () => {
          new LazyMessageReader(messageDefinition);
        },
      },
    ]);

    const reader = new MessageReader(messageDefinition);
    const lazyReader = new LazyMessageReader(messageDefinition);

    runCases("read", [
      {
        name: "reg",
        benchCase: () => reader.readMessage(msgData),
      },
      {
        name: "lazy",
        benchCase: () => lazyReader.readMessage(msgData),
      },
    ]);

    runCases("last field", [
      {
        name: "reg",
        benchCase: () => {
          const msg = reader.readMessage(msgData);
          lastField(msg);
        },
      },
      {
        name: "lazy",
        benchCase: () => {
          const msg = lazyReader.readMessage(msgData);
          lastField(msg);
        },
      },
    ]);
  }
}

setTimeout(() => void main(), 1000);
