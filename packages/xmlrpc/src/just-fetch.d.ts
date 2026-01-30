// Type declaration for @foxglove/just-fetch
// This workaround is needed because the package doesn't have proper type exports for NodeNext
declare module "@foxglove/just-fetch" {
  const fetch: typeof globalThis.fetch;
  export default fetch;
}
