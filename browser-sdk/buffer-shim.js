import { Buffer } from 'buffer';
export { Buffer };
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}
