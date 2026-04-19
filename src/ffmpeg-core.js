import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';


let ffmpeg = null;
let loadPromise = null;

export async function getFFmpeg(onStatus) {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onStatus?.('Loading FFmpeg…');
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));
    const base = `${window.location.origin}/ffmpeg`;
    await ffmpeg.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
    });
    onStatus?.('FFmpeg ready');
    return ffmpeg;
  })();

  return loadPromise;
}

export { fetchFile };

export function getDateSuffix() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function fmtEta(secs) {
  if (!isFinite(secs) || secs < 0) return '';
  return `~${fmtDuration(Math.ceil(secs))} remaining`;
}

// Run a probe pass and return { duration, hasAudio }
export async function probeFile(ff, filename) {
  let duration = 0;
  let hasAudio = false;
  let active = true;

  const handler = ({ message }) => {
    if (!active) return;
    const dm = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (dm) {
      duration = +dm[1] * 3600 + +dm[2] * 60 + parseFloat(dm[3]);
    }
    if (message.includes('Audio:')) hasAudio = true;
  };

  ff.on('log', handler);
  // -i alone exits non-zero; swallow the rejection
  await ff.exec(['-hide_banner', '-i', filename]).catch(() => {});
  active = false;
  ff.off('log', handler);

  return { duration, hasAudio };
}

// Write silent AAC audio alongside an existing video file (remux only, no re-encode)
export async function addSilentAudio(ff, srcName, dstName, duration) {
  await ff.exec([
    '-hide_banner',
    '-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=r=48000:cl=stereo',
    '-i', srcName,
    '-c:v', 'copy',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-shortest',
    dstName,
  ]);
}

// Encode a single clip to target H.264 settings.
// hasAudio=false → mix in a silent track during this pass.
// -flags +cgop ensures every segment starts with a closed IDR, required for clean stream-copy stitching.
export async function normalizeClip(ff, srcName, dstName, { duration, hasAudio }, onProgress) {
  const startMs = performance.now();

  const logHandler = ({ message }) => {
    const m = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (m && duration > 0) {
      const encoded = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
      const ratio = Math.min(encoded / duration, 1);
      const elapsedSec = (performance.now() - startMs) / 1000;
      const etaSec = ratio > 0.01 ? elapsedSec / ratio - elapsedSec : Infinity;
      onProgress?.(ratio, etaSec);
    }
  };

  const args = ['-hide_banner'];
  if (!hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  }
  args.push('-i', srcName);

  const videoMap = hasAudio ? '0:v' : '1:v';
  const audioMap = hasAudio ? '0:a' : '0:a';

  args.push(
    '-map', videoMap, '-map', audioMap,
    '-c:v', 'libx264', '-preset', 'fast',
    '-profile:v', 'main', '-level:v', '4.0',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r', '30',
    '-maxrate', '2000k', '-bufsize', '4000k',
    '-flags', '+cgop',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-shortest',
    dstName,
  );

  ff.on('log', logHandler);
  await ff.exec(args);
  ff.off('log', logHandler);
}

// Stitch pre-encoded segments from filelist.txt using stream copy — no re-encode.
export async function stitchConcat(ff, outputName, onStatus) {
  onStatus?.('Stitching…');
  await ff.exec([
    '-hide_banner',
    '-f', 'concat', '-safe', '0', '-i', 'filelist.txt',
    '-c:v', 'copy', '-c:a', 'copy',
    '-movflags', '+faststart',
    outputName,
  ]);
}

// Final H.264 encode from a concat filelist already written to the FS
export async function encodeConcat(ff, outputName, onProgress, totalDuration) {
  let startMs = performance.now();

  const logHandler = ({ message }) => {
    const m = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (m && totalDuration > 0) {
      const encoded = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
      const ratio = Math.min(encoded / totalDuration, 1);
      const elapsedSec = (performance.now() - startMs) / 1000;
      const etaSec = ratio > 0.01 ? elapsedSec / ratio - elapsedSec : Infinity;
      onProgress?.(ratio, etaSec);
    }
  };

  ff.on('log', logHandler);
  await ff.exec([
    '-hide_banner',
    '-f', 'concat', '-safe', '0', '-i', 'filelist.txt',
    '-c:v', 'libx264', '-preset', 'fast',
    '-profile:v', 'main', '-level:v', '4.0',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r', '30',
    '-maxrate', '2000k', '-bufsize', '4000k',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    outputName,
  ]);
  ff.off('log', logHandler);
}

export function downloadFile(data, filename) {
  const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
