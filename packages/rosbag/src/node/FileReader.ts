// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import * as fs from "fs/promises";

import { Filelike } from "../types";

// reader using nodejs fs api
export default class FileReader implements Filelike {
  _filename: string;
  _file?: fs.FileHandle;
  _size: number;

  constructor(filename: string) {
    this._filename = filename;
    this._file = undefined;
    this._size = 0;
  }

  // open a file for reading
  private async _open(): Promise<void> {
    this._file = await fs.open(this._filename, "r");
    this._size = (await this._file.stat()).size;
  }

  async close(): Promise<void> {
    await this._file?.close();
  }

  // read length (bytes) starting from offset (bytes)
  async read(offset: number, length: number): Promise<Uint8Array> {
    if (this._file == null) {
      await this._open();
      return await this.read(offset, length);
    }

    const buffer = new Uint8Array(length);
    const { bytesRead } = await this._file.read(buffer, 0, length, offset);
    if (bytesRead < length) {
      throw new Error(
        `Attempted to read ${length} bytes at offset ${offset} but only ${bytesRead} were available`,
      );
    }
    return buffer;
  }

  // return the size of the file
  size(): number {
    return this._size;
  }
}
