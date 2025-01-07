import lz4 from "lz4js";

import { Bag } from "./index";
import { FileReader } from "./node";

const bagFilePath = "/Users/roman/Downloads/nuScenes-v1.0-mini-scene-0061.bag";

const decompress = {
  lz4: (buffer: Uint8Array) => lz4.decompress(buffer),
};

async function readMessages() {
  const reader = new FileReader(bagFilePath);
  const bag = new Bag(reader);
  await bag.open();

  const start = performance.now();
  let count = 0;
  await bag.readMessages({ noParse: true, decompress }, (result) => {
    // no-op
    count += 1;
    void result;
  });
  const end = performance.now();
  console.log(`[read messages] (${count}) duration ms: ${end - start}`);
  await reader.close();
}

async function forwardIter() {
  const reader = new FileReader(bagFilePath);
  const bag = new Bag(reader, { decompress });
  await bag.open();

  const start = performance.now();
  const iter = bag.messageIterator();

  let count = 0;
  for await (const msg of iter) {
    count += 1;
    void msg;
  }
  const end = performance.now();
  console.log(`[forward iter] (${count}) duration ms: ${end - start}`);
  await reader.close();
}

async function reverseIter() {
  const reader = new FileReader(bagFilePath);
  const bag = new Bag(reader, { decompress });
  await bag.open();

  const start = performance.now();
  const iter = bag.messageIterator({ reverse: true });

  let count = 0;
  for await (const msg of iter) {
    count += 1;
    void msg;
  }
  const end = performance.now();
  console.log(`[reverse iter] (${count}) duration ms: ${end - start}`);
  await reader.close();
}

async function main() {
  await readMessages();
  //await readMessages();
  await forwardIter();
  //await forwardIter();
  await reverseIter();
  //await reverseIter();
}

void main();
