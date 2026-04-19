import { getFFmpeg, fetchFile, probeFile, normalizeClip, stitchConcat, downloadFile, getDateSuffix } from './ffmpeg-core.js';

export async function probeForLoop(file, onStatus) {
  const ff = await getFFmpeg(onStatus);
  await ff.writeFile('loop_src_probe.mp4', await fetchFile(file));
  const { duration, hasAudio } = await probeFile(ff, 'loop_src_probe.mp4');
  await ff.deleteFile('loop_src_probe.mp4').catch(() => {});
  const loopCount = duration > 0 ? Math.ceil(3600 / duration) : 0;
  return { duration, hasAudio, loopCount, totalDuration: loopCount * duration };
}

export async function createLoop(file, { onStatus, onProgress }) {
  const ff = await getFFmpeg(onStatus);

  onStatus('Writing source file…');
  await ff.writeFile('loop_raw.mp4', await fetchFile(file));
  const { duration, hasAudio } = await probeFile(ff, 'loop_raw.mp4');

  // Pass 1: encode source clip once to target settings (~seconds for a short clip)
  onStatus('Normalizing clip (pass 1/2)…');
  await normalizeClip(ff, 'loop_raw.mp4', 'loop_norm.mp4', { duration, hasAudio },
    (ratio, eta) => onProgress?.(ratio * 0.8, eta),
  );
  await ff.deleteFile('loop_raw.mp4').catch(() => {});

  // Pass 2: stitch N copies via stream copy — no re-encode, just packet I/O
  const loopCount = Math.ceil(3600 / duration);
  onStatus(`Stitching ${loopCount} copies (pass 2/2)…`);
  onProgress?.(0.8, 0);
  const lines = Array.from({ length: loopCount }, () => `file 'loop_norm.mp4'`).join('\n');
  await ff.writeFile('filelist.txt', lines);
  await stitchConcat(ff, 'loop_output.mp4', onStatus);

  onProgress?.(0.98, 0);
  onStatus('Preparing download…');
  const data = await ff.readFile('loop_output.mp4');
  downloadFile(data, `video_loop_${getDateSuffix()}.mp4`);

  await ff.deleteFile('loop_norm.mp4').catch(() => {});
  await ff.deleteFile('filelist.txt').catch(() => {});
  await ff.deleteFile('loop_output.mp4').catch(() => {});

  onStatus('Done!');
}
