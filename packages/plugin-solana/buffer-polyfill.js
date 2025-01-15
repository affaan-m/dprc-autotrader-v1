import { Buffer } from 'buffer';
import process from 'process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Set up global Buffer
globalThis.Buffer = Buffer;

// Set up global process
globalThis.process = process;

// Set up __filename and __dirname
if (typeof import.meta !== 'undefined') {
    globalThis.__filename = fileURLToPath(import.meta.url);
    globalThis.__dirname = dirname(globalThis.__filename);
}

export { Buffer };