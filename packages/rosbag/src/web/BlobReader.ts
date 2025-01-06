// Copyright 2018-2020 Cruise LLC
// Copyright 2021 Foxglove Technologies Inc
//
// This source code is licensed under the Apache License, Version 2.0,
// found in the LICENSE file in the root directory of this source tree.
// You may not use this file except in compliance with the License.

import { Filelike } from "../types";

// browser reader for Blob|File objects
export default class BlobReader implements Filelike {
  _blob: Blob;
  _size: number;

  constructor(blob: Blob | File) {
    if (!(blob instanceof Blob)) {
      throw new Error("Expected file to be a File or Blob.");
    }

    this._blob = blob;
    this._size = blob.size;
  }

  // read length (bytes) starting from offset (bytes)
  async read(offset: number, length: number): Promise<Uint8Array> {
    const arrBuf = await this._blob.slice(offset, offset + length).arrayBuffer();
    return new Uint8Array(arrBuf);
  }

  // return the size of the file
  size(): number {
    return this._size;
  }
}
