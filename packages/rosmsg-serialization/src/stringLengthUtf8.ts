/**
 * Returns the number of bytes that would be used when encoding the string as UTF-8, effectively the
 * same as `new TextEncoder().encode(str).length` but faster.
 * https://jsbench.me/nzlrkwmeiq/1
 */
export function stringLengthUtf8(str: string): number {
  let byteLength = 0;
  const numCodeUnits = str.length;
  for (let i = 0; i < numCodeUnits; i++) {
    const codeUnit = str.charCodeAt(i); // 0x0000-0xFFFF
    if (codeUnit <= 0x7f) {
      byteLength += 1; // 0b0xxxxxxx
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2; // 0b110xxxxx 0b10xxxxxx
    } else if (0xd800 <= codeUnit && codeUnit <= 0xdbff) {
      // If the input string is valid UTF-16 then these surrogate characters come in pairs. They
      // represent code points in the range 0x100000-0x10ffff and are represented with 4 bytes in
      // UTF-8.
      const nextCodeUnit = str.charCodeAt(i + 1);
      if (0xdc00 <= nextCodeUnit && nextCodeUnit <= 0xdfff) {
        byteLength += 4; // 0b11110xxx 0b10xxxxxx 0b10xxxxxx 0b10xxxxxx
        i++;
      } else {
        byteLength += 3; // 0b1110xxxx 0b10xxxxxx 0b10xxxxxx
      }
    } else {
      // <= 0xFFFF
      byteLength += 3; // 0b1110xxxx 0b10xxxxxx 0b10xxxxxx
    }
  }
  return byteLength;
}
