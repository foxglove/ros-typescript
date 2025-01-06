import { parse } from "@foxglove/rosmsg";
import { printTable } from "console-table-printer";
import { Benchmark, BenchmarkData, Measurement } from "kelonio";
import percentile from "percentile";

import { LazyMessageReader, MessageReader, MessageWriter } from "../src";

type Testcase = {
  name: string;
  msgDef: string;
  msg: unknown;
  lastField: (msg: unknown) => void;
};

async function bench(testCase: Testcase): Promise<void> {
  const benchmark = new Benchmark();

  const msgDefStr = testCase.msgDef;
  const lastField = testCase.lastField;

  const messageDefinition = parse(msgDefStr);

  const writer = new MessageWriter(messageDefinition);
  const msgData = writer.writeMessage(testCase.msg);

  await benchmark.record(["reg", "create new reader"], () => {
    new MessageReader(messageDefinition);
  });

  {
    const messageReader = new MessageReader(messageDefinition);
    await benchmark.record(["reg", "read"], () => {
      messageReader.readMessage(msgData);
    });

    const msg = messageReader.readMessage(msgData);
    await benchmark.record(["reg", "access last field"], () => {
      lastField(msg);
    });
  }

  await benchmark.record(["lazy", "create new reader"], () => {
    new LazyMessageReader(messageDefinition);
  });

  {
    const messageReader = new LazyMessageReader(messageDefinition);

    await benchmark.record(["lazy", "size"], () => {
      messageReader.size(msgData);
    });

    await benchmark.record(["lazy", "read"], () => {
      messageReader.readMessage(msgData);
    });

    {
      let msg = messageReader.readMessage(msgData);
      await benchmark.record(
        ["lazy", "access last field"],
        () => {
          lastField(msg);
        },
        {
          beforeEach: () => {
            msg = messageReader.readMessage(msgData);
          },
        },
      );
    }

    {
      let msg = messageReader.readMessage(msgData);
      await benchmark.record(
        ["lazy", "access last field again"],
        () => {
          lastField(msg);
        },
        {
          beforeEach: () => {
            msg = messageReader.readMessage(msgData);
            lastField(msg);
          },
        },
      );
    }

    {
      let msg = messageReader.readMessage(msgData);
      await benchmark.record(
        ["lazy", "toObject"],
        () => {
          msg.toObject();
        },
        {
          beforeEach: () => {
            msg = messageReader.readMessage(msgData);
          },
        },
      );
    }
  }

  console.log(testCase.name);
  printTable(Object.values(tableReport(benchmark.data)));
}

function tableReport(level: BenchmarkData, obj: Record<string, unknown> = {}, prefix = "") {
  for (const [description, info] of Object.entries(level)) {
    const showMeasurement = info.durations.length > 0;
    const showChildren = Object.keys(info.children).length > 0;

    const label = `${prefix}${description}`;
    if (showMeasurement) {
      const percentiles = percentile([95, 99], info.durations) as number[];
      const measurement = new Measurement(info.durations);
      const mean = measurement.mean.toFixed(5);
      const moe = (measurement.marginOfError * 100).toFixed(2);
      const stdDev = measurement.standardDeviation.toFixed(5);
      const max = measurement.max.toFixed(5);
      const iterations = measurement.durations.length;
      const [percentile95, percentile99] = percentiles;
      obj[label] = {
        label,
        mean,
        stdDev,
        max,
        percentile95: percentile95!.toFixed(5),
        percentile99: percentile99!.toFixed(5),
        "margin of error %": moe,
        iterations,
      };
    }
    if (showChildren) {
      tableReport(info.children, obj, `${label} `);
    }
  }
  return obj;
}

export { bench };
