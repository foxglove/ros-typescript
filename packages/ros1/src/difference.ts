// Return the set difference between an array and another array or iterable.
// The results are not sorted in any stable ordering
export function difference<T>(a: T[], b: T[] | IterableIterator<T>): T[] {
  const sb = new Set(b);
  return Array.from(new Set(a.filter((x) => !sb.has(x))).values());
}
