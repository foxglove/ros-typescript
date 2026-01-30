// Polyfill TextEncoder/TextDecoder for jsdom environment
import { TextEncoder, TextDecoder } from "util";

Object.assign(global, { TextEncoder, TextDecoder });
