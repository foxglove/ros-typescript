import { compare, add as addTime } from "@foxglove/rostime";
import Heap from "heap";

import { BaseIterator } from "./BaseIterator";
import { ChunkInfo } from "./record";
import { IteratorConstructorArgs, ChunkReadResult } from "./types";

export class ForwardIterator extends BaseIterator {
  private remainingChunkInfos: (ChunkInfo | undefined)[];

  constructor(args: IteratorConstructorArgs) {
    // Sort by smallest timestamp first
    super(args, (a, b) => {
      return compare(a.time, b.time);
    });

    // These are all chunks that we can consider for iteration.
    // Only consider chunks with an endTime after or equal to our position.
    // Chunks before our position are not part of forward iteration.
    this.chunkInfos = this.chunkInfos.filter((info) => {
      return compare(info.endTime, this.position) >= 0;
    });

    // The chunk info heap sorts chunk infos by increasing start time
    const chunkInfoHeap = new Heap<ChunkInfo>((a, b) => {
      return compare(a.startTime, b.startTime);
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

    let end = firstChunkInfo.endTime;
    const chunksToLoad: ChunkInfo[] = [firstChunkInfo];

    for (let idx = 1; idx < this.remainingChunkInfos.length; ++idx) {
      const nextChunkInfo = this.remainingChunkInfos[idx];
      if (!nextChunkInfo) {
        continue;
      }

      // The chunk starts after our selected end time, we end chunk selection
      if (compare(nextChunkInfo.startTime, end) > 0) {
        break;
      }

      // The chunk starts after our start, but before end so we will load it.
      chunksToLoad.push(nextChunkInfo);

      // If the chunk ends before or at the end time, we have fully consumed it.
      // Remove it from the remainingChunkInfos.
      const endCompare = compare(nextChunkInfo.endTime, end);
      if (endCompare <= 0) {
        this.remainingChunkInfos[idx] = undefined;
      }
    }

    // filter out undefined chunk infos
    this.remainingChunkInfos = this.remainingChunkInfos.filter(Boolean);

    // End of file or no more candidates
    if (chunksToLoad.length === 0) {
      return false;
    }

    // Add 1 nsec to make end 1 past the end for the next read
    this.position = end = addTime(end, { sec: 0, nsec: 1 });

    const heap = this.heap;
    const newCache = new Map<number, ChunkReadResult>();
    for (const chunkInfo of chunksToLoad) {
      let result = this.cachedChunkReadResults.get(chunkInfo.chunkPosition);
      if (!result) {
        result = await this.reader.readChunk(chunkInfo, this.decompress);
      }

      // Keep chunk read results for chunks where end is in the chunk
      // End is the next position we will read so we don't need to re-read the chunk
      if (compare(chunkInfo.startTime, end) <= 0 && compare(chunkInfo.endTime, end) >= 0) {
        newCache.set(chunkInfo.chunkPosition, result);
      }

      for (const indexData of result.indices) {
        if (this.connectionIds && !this.connectionIds.has(indexData.conn)) {
          continue;
        }
        for (const indexEntry of indexData.indices ?? []) {
          // ensure: stamp <= entry time < end
          if (compare(indexEntry.time, stamp) < 0 || compare(indexEntry.time, end) >= 0) {
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
