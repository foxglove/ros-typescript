// Type declarations for modules without types
declare module "heap" {
  export default class Heap<T> {
    constructor(cmp?: (a: T, b: T) => number);
    push(item: T): void;
    pop(): T | undefined;
    front(): T | undefined;
    peek(): T | undefined;
    insert(item: T): void;
    replace(item: T): T;
    size(): number;
    empty(): boolean;
    toArray(): T[];
  }
}

declare module "compressjs" {
  export const Bzip2: {
    decompressFile(data: Uint8Array): Uint8Array;
  };
}

declare module "lz4js" {
  export function decompress(data: Uint8Array, size?: number): Uint8Array;
}
