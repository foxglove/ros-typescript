import { compare, subtract as subTime } from "@foxglove/rostime";
import Heap from "heap";

import { BaseIterator } from "./BaseIterator";
import { ChunkInfo } from "./record";
import { ChunkReadResult, IteratorConstructorArgs } from "./types";

export class ReverseIterator extends BaseIterator {
  private remainingChunkInfos: (ChunkInfo | undefined)[];

  constructor(args: IteratorConstructorArgs) {
    // Sort by largest timestamp first
    super(args, (a, b) => {
      return compare(b.time, a.time);
    });

    // These are all chunks that we can consider for iteration.
    // Only consider chunks with a start before or equal to our position.
    // Chunks starting after our position are not part of reverse iteration
    this.chunkInfos = this.chunkInfos.filter((info) => {
      return compare(info.startTime, this.position) <= 0;
    });

    // The chunk info heap sorts chunk infos by decreasing end time
    const chunkInfoHeap = new Heap<ChunkInfo>((a, b) => {
      return compare(b.endTime, a.endTime);
    });

    for (const info of this.chunkInfos) {
      chunkInfoHeap.insert(info);
    }

    this.remainingChunkInfos = [];
    while (chunkInfoHeap.size() > 0) {
      this.remainingChunkInfos.push(chunkInfoHeap.pop());
    }
  }

  protected override async loadNext(): Promise<boolean> {
    const stamp = this.position;

    const firstChunkInfo = this.remainingChunkInfos[0];
    if (!firstChunkInfo) {
      return false;
    }

    this.remainingChunkInfos[0] = undefined;

    let start = firstChunkInfo.startTime;
    const chunksToLoad: ChunkInfo[] = [firstChunkInfo];

    for (let idx = 1; idx < this.remainingChunkInfos.length; ++idx) {
      const nextChunkInfo = this.remainingChunkInfos[idx];
      if (!nextChunkInfo) {
        continue;
      }

      // The chunk ends before our selected start, we end chunk selection
      if (compare(nextChunkInfo.endTime, start) < 0) {
        break;
      }

      // The chunk ends after our start so we will load it
      chunksToLoad.push(nextChunkInfo);

      // If the chunk starts after or at the start time, we have fully consumed it
      const startCompare = compare(nextChunkInfo.startTime, start);
      if (startCompare >= 0) {
        this.remainingChunkInfos[idx] = undefined;
      }
    }

    // filter out undefined chunk infos
    this.remainingChunkInfos = this.remainingChunkInfos.filter(Boolean);

    // End of file or no more candidates
    if (chunksToLoad.length === 0) {
      return false;
    }

    // Subtract 1 nsec to make the next position 1 before
    this.position = start = subTime(start, { sec: 0, nsec: 1 });

    const heap = this.heap;
    const newCache = new Map<number, ChunkReadResult>();
    for (const chunkInfo of chunksToLoad) {
      let result = this.cachedChunkReadResults.get(chunkInfo.chunkPosition);
      if (!result) {
        result = await this.reader.readChunk(chunkInfo, this.decompress);
      }

      // Keep chunk read results for chunks where end is in the chunk
      // End is the next position we will read so we don't need to re-read the chunk
      if (compare(chunkInfo.startTime, start) <= 0 && compare(chunkInfo.endTime, start) >= 0) {
        newCache.set(chunkInfo.chunkPosition, result);
      }

      for (const indexData of result.indices) {
        if (this.connectionIds && !this.connectionIds.has(indexData.conn)) {
          continue;
        }
        for (const indexEntry of indexData.indices ?? []) {
          // skip any time that is before our current timestamp or after end, we will never iterate to those
          if (compare(indexEntry.time, start) <= 0 || compare(indexEntry.time, stamp) > 0) {
            continue;
          }
          heap.push({ time: indexEntry.time, offset: indexEntry.offset, chunkReadResult: result });
        }
      }
    }

    this.cachedChunkReadResults = newCache;
    return true;
  }
}
