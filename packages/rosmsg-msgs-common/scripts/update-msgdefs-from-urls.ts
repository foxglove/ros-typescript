import { createWriteStream, existsSync } from "fs";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import * as http from "http";
import * as https from "https";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";

import { generateMsgDeps } from "./gendeps";

type DownloadedMsg = {
  url: string;
  packageName: string;
  msgRelativePath: string; // e.g., grid_map_msgs/msg/GridMap.msg
  tempFilePath: string;
};

async function main() {
  const packageRoot = process.cwd();
  const repoRoot = resolve(packageRoot, "../..");
  const urlsListPath = resolve(packageRoot, "scripts/extra-message-def-urls.txt");
  const urlsListContent = await readFile(urlsListPath, { encoding: "utf8" });
  const urls = urlsListContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (urls.length === 0) {
    console.error("No URLs found in list.");
    process.exit(1);
  }

  const tmpBase = resolve(tmpdir(), `ros-msgdefs-${Date.now()}`);
  await mkdir(tmpBase, { recursive: true });

  const downloads: DownloadedMsg[] = [];
  for (const url of urls) {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const match = /\/([^/#?]+)\/msg\/(.+\.msg)$/.exec(path);
    if (!match) {
      console.warn(`Skipping URL without /<pkg>/msg/*.msg structure: ${url}`);
      continue;
    }
    const packageName = match[1]!;
    const msgFileRest = match[2]!; // e.g., GridMap.msg or nested/path.msg
    const msgRelativePath = join(packageName, "msg", msgFileRest);
    const destPath = resolve(tmpBase, msgRelativePath);
    await mkdir(dirname(destPath), { recursive: true });
    await downloadToFile(url, destPath);
    downloads.push({ url, packageName, msgRelativePath, tempFilePath: destPath });
  }

  if (downloads.length === 0) {
    console.error("No downloadable .msg files found. Nothing to do.");
    process.exit(1);
  }

  const msgdefsRoot = resolve(packageRoot, "msgdefs");
  const ros2Roots = await listRos2Roots(msgdefsRoot);
  if (ros2Roots.length === 0) {
    console.error("No ros2* directories found under packages/rosmsg-msgs-common/msgdefs");
    process.exit(1);
  }

  for (const ros2Root of ros2Roots) {
    for (const item of downloads) {
      const targetMsgPath = resolve(ros2Root, item.msgRelativePath);
      await mkdir(dirname(targetMsgPath), { recursive: true });

      // Stage downloaded content at target path so gendeps can resolve <msg-file> under <msgdefs-dir>
      const originalContent = existsSync(targetMsgPath)
        ? await readFile(targetMsgPath, { encoding: "utf8" }).catch(() => undefined)
        : undefined;
      const downloadedContent = await readFile(item.tempFilePath, { encoding: "utf8" });
      await writeFile(targetMsgPath, downloadedContent, { encoding: "utf8" });

      try {
        const unrolled = await runGendeps(ros2Root, targetMsgPath);
        await writeFile(targetMsgPath, unrolled, { encoding: "utf8" });
        process.stdout.write(
          `Updated ${pathFromRepo(repoRoot, targetMsgPath)} (from ${item.url})\n`,
        );
      } catch (err) {
        if (originalContent != undefined) {
          await writeFile(targetMsgPath, originalContent, { encoding: "utf8" }).catch(
            console.error,
          );
        }
        console.error(
          `Failed to generate dependencies for ${pathFromRepo(
            repoRoot,
            targetMsgPath,
          )}: ${(err as Error).message}`,
        );
      }
    }
  }
}

async function listRos2Roots(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("ros2"))
    .map((e) => resolve(baseDir, e.name));
}

function pathFromRepo(repoRoot: string, absPath: string): string {
  return absPath.startsWith(repoRoot) ? absPath.slice(repoRoot.length + 1) : absPath;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const client = url.startsWith("https:") ? https : http;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const file = createWriteStream(destPath);
    const req = client.get(url, (res) => {
      if (
        res.statusCode != undefined &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        // Follow redirects
        downloadToFile(res.headers.location, destPath).then(resolvePromise, rejectPromise);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        rejectPromise(new Error(`HTTP ${res.statusCode ?? "unknown"} for ${url}`));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          resolvePromise();
        });
      });
    });
    req.on("error", (err) => {
      file.close();
      rejectPromise(err);
    });
  });
}

async function runGendeps(msgdefsRoot: string, msgFile: string): Promise<string> {
  return await generateMsgDeps(msgdefsRoot, msgFile);
}

void main();
