// Returns true if an object was created by the Object constructor, Object.create(null), or {}.
export function isPlainObject(o: unknown): boolean {
  const m = o as Record<string, unknown>;
  return m != undefined && (m.constructor === Object || m.constructor == undefined);
}

// Returns true if an object was created by the Object constructor, Object.create(null), or {}, and
// the object does not contain any enumerable keys.
export function isEmptyPlainObject(o: unknown): boolean {
  const m = o as Record<string, unknown>;
  return isPlainObject(m) && Object.keys(m).length === 0;
}
