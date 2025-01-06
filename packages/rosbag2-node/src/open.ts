import { Rosbag2 } from "@foxglove/rosbag2";
import { MessageReaderOptions } from "@foxglove/rosmsg2-serialization";
import { readdir } from "fs/promises";
import path from "path";

import { SqliteNodejs } from "./SqliteNodejs";

export async function openNodejsFile(
  filename: string,
  messageReaderOptions?: MessageReaderOptions,
): Promise<Rosbag2> {
  const file = new SqliteNodejs(filename);
  const bag = new Rosbag2([file], messageReaderOptions);
  await bag.open();
  return bag;
}

export async function openNodejsDirectory(
  folder: string,
  messageReaderOptions?: MessageReaderOptions,
): Promise<Rosbag2> {
  const filenames = await listFiles(folder, ".");
  const entries = filenames
    .filter((filename) => filename.toLowerCase().endsWith(".db3"))
    .map((filename) => new SqliteNodejs(path.join(folder, filename)));
  const bag = new Rosbag2(entries, messageReaderOptions);
  await bag.open();
  return bag;
}

async function listFiles(baseDir: string, dirname: string): Promise<string[]> {
  let filenames: string[] = [];
  const fullPath = path.join(baseDir, dirname);
  const entries = await readdir(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirname, entry.name);
    if (entry.isFile()) {
      filenames.push(entryPath);
    } else if (entry.isDirectory()) {
      filenames = filenames.concat(await listFiles(baseDir, entryPath));
    }
  }
  return filenames;
}
