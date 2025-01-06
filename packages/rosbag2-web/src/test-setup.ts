import { TextEncoder, TextDecoder } from "node:util";

// JSDOM does not provide TextEncoder and TextDecoder
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
