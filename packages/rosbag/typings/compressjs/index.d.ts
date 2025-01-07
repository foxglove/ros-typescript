declare module "compressjs" {
  interface Bzip2 {
    decompressFile(buff: Uint8Array): Uint8Array;
  }

  export const Bzip2: Bzip2;
}
