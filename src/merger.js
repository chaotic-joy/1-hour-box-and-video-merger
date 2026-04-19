import { getFFmpeg, fetchFile, probeFile, addSilentAudio, encodeConcat, downloadFile, getDateSuffix } from './ffmpeg-core.js';

// files: File[]
// onStatus(msg), onProgress(ratio, etaSec)
export async function mergeVideos(files, { onStatus, onProgress }) {
  const ff = await getFFmpeg(onStatus);

  onStatus('Analyzing files…');

  const normalized = [];
  let totalDuration = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rawName = `raw_${i}.mp4`;
    onStatus(`Writing file ${i + 1}/${files.length}…`);
    await ff.writeFile(rawName, await fetchFile(file));

    const { duration, hasAudio } = await probeFile(ff, rawName);
    totalDuration += duration;

    if (hasAudio) {
      normalized.push(rawName);
    } else {
      const normName = `norm_${i}.mp4`;
      onStatus(`Adding silent audio to file ${i + 1}…`);
      await addSilentAudio(ff, rawName, normName, duration);
      normalized.push(normName);
      await ff.deleteFile(rawName);
    }
  }

  onStatus('Building file list…');
  const filelistContent = normalized.map(n => `file '${n}'`).join('\n');
  await ff.writeFile('filelist.txt', filelistContent);

  onStatus('Encoding…');
  const outputName = 'output.mp4';
  await encodeConcat(ff, outputName, onProgress, totalDuration);

  onStatus('Preparing download…');
  const data = await ff.readFile(outputName);
  downloadFile(data, `Merged Video ${getDateSuffix()}.mp4`);

  // Cleanup
  for (const n of normalized) await ff.deleteFile(n).catch(() => {});
  await ff.deleteFile('filelist.txt').catch(() => {});
  await ff.deleteFile(outputName).catch(() => {});

  onStatus('Done!');
}
