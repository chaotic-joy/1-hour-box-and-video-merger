import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules/@ffmpeg/core/dist/esm');
const dst = join(root, 'public/ffmpeg');

mkdirSync(dst, { recursive: true });
cpSync(join(src, 'ffmpeg-core.js'), join(dst, 'ffmpeg-core.js'));
cpSync(join(src, 'ffmpeg-core.wasm'), join(dst, 'ffmpeg-core.wasm'));
console.log('ffmpeg core files copied to public/ffmpeg/');
