const decoder = new TextDecoder();

/**
 * Fast UTF8 string decoding. TextDecoder becomes faster for large strings, but String.fromCharCode
 * is faster for small strings. However, TextDecoder is required if the data contains any non-ASCII
 * chars.
 */
export default function decodeString(data: Uint8Array): string {
  if (data.length >= 50) {
    return decoder.decode(data);
  }
  for (let i = 0; i < data.length; i++) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (data[i]! & 0x80) {
      return decoder.decode(data);
    }
  }
  return String.fromCharCode.apply(null, data as unknown as number[]);
}
