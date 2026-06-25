const unsafePropertyNames = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeName(name: string): string {
  const sanitized = name.replace(/^[0-9]|[^a-zA-Z0-9_]/g, "_");
  if (sanitized.length === 0) {
    return "_";
  }
  return unsafePropertyNames.has(sanitized) ? `_${sanitized}` : sanitized;
}
