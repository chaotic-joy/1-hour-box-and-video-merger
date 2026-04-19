import './style.css';
import { mergeVideos } from './merger.js';
import { probeForLoop, createLoop } from './looper.js';
import { fmtDuration, fmtEta } from './ffmpeg-core.js';

// ── Tab switching ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Helpers ──────────────────────────────────────────────────────
function setProgress(prefix, ratio, etaSec) {
  const pct = Math.round(ratio * 100);
  document.getElementById(`${prefix}-progress-pct`).textContent = `${pct}%`;
  document.getElementById(`${prefix}-progress-bar`).style.width = `${pct}%`;
  document.getElementById(`${prefix}-eta`).textContent = ratio < 1 ? fmtEta(etaSec) : '';
}

function setStatus(prefix, msg, type = '') {
  const el = document.getElementById(`${prefix}-status`);
  el.textContent = msg;
  el.className = `status-msg${type ? ' ' + type : ''}`;
}

function setFfmpegStatus(prefix, msg) {
  document.getElementById(`${prefix}-ffmpeg-status`).textContent = msg;
}

function showProgress(prefix, visible) {
  document.getElementById(`${prefix}-progress`).classList.toggle('visible', visible);
}

// ── MERGE ────────────────────────────────────────────────────────
const mergeFiles = [];
const mergeDropZone = document.getElementById('merge-drop-zone');
const mergeFileInput = document.getElementById('merge-file-input');
const mergePickBtn = document.getElementById('merge-pick-btn');
const mergeStartBtn = document.getElementById('merge-start-btn');
const mergeFileList = document.getElementById('merge-file-list');

function renderMergeList() {
  mergeFileList.innerHTML = '';
  mergeFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <svg class="file-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
      </svg>
      <span class="file-name">${file.name}</span>
      <span class="file-meta">${(file.size / 1e6).toFixed(1)} MB</span>
      <button class="btn-remove" data-i="${i}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;
    mergeFileList.appendChild(item);
  });
  mergeStartBtn.disabled = mergeFiles.length < 2;

  mergeFileList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      mergeFiles.splice(+btn.dataset.i, 1);
      renderMergeList();
    });
  });
}

function addMergeFiles(files) {
  for (const f of files) {
    if (f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|mkv|avi|webm|m4v|wmv)$/i)) {
      mergeFiles.push(f);
    }
  }
  renderMergeList();
}

mergePickBtn.addEventListener('click', () => mergeFileInput.click());
mergeFileInput.addEventListener('change', () => addMergeFiles(mergeFileInput.files));

mergeDropZone.addEventListener('dragover', e => { e.preventDefault(); mergeDropZone.classList.add('dragover'); });
mergeDropZone.addEventListener('dragleave', () => mergeDropZone.classList.remove('dragover'));
mergeDropZone.addEventListener('drop', e => {
  e.preventDefault();
  mergeDropZone.classList.remove('dragover');
  addMergeFiles(e.dataTransfer.files);
});

mergeStartBtn.addEventListener('click', async () => {
  if (mergeFiles.length < 2) return;
  mergeStartBtn.disabled = true;
  showProgress('merge', true);
  setProgress('merge', 0, Infinity);
  setStatus('merge', '');

  try {
    await mergeVideos([...mergeFiles], {
      onStatus: msg => setFfmpegStatus('merge', msg),
      onProgress: (ratio, eta) => setProgress('merge', ratio, eta),
    });
    setProgress('merge', 1, 0);
    setStatus('merge', 'Download started!', 'success');
  } catch (err) {
    console.error('Merge error:', err);
    setStatus('merge', `Error: ${err?.message || String(err)}`, 'error');
  } finally {
    mergeStartBtn.disabled = mergeFiles.length < 2;
  }
});

// ── LOOP ─────────────────────────────────────────────────────────
let loopFile = null;
const loopDropZone = document.getElementById('loop-drop-zone');
const loopFileInput = document.getElementById('loop-file-input');
const loopPickBtn = document.getElementById('loop-pick-btn');
const loopStartBtn = document.getElementById('loop-start-btn');
const loopInfo = document.getElementById('loop-info');

async function setLoopFile(file) {
  if (!file) return;
  loopFile = file;
  loopStartBtn.disabled = true;
  setStatus('loop', '');
  loopInfo.style.display = 'none';

  try {
    setStatus('loop', 'Probing file…');
    const { duration, loopCount, totalDuration } = await probeForLoop(file, msg => setFfmpegStatus('loop', msg));

    document.getElementById('loop-file-name').textContent = file.name.length > 30
      ? file.name.slice(0, 27) + '…' : file.name;
    document.getElementById('loop-src-duration').textContent = fmtDuration(duration);
    document.getElementById('loop-count').textContent = `${loopCount}×`;
    document.getElementById('loop-out-duration').textContent = fmtDuration(totalDuration);

    loopInfo.style.display = 'flex';
    loopStartBtn.disabled = false;
    setStatus('loop', '');
  } catch (err) {
    console.error('Probe error:', err);
    setStatus('loop', `Failed to probe: ${err?.message || String(err)}`, 'error');
  }
}

loopPickBtn.addEventListener('click', () => loopFileInput.click());
loopFileInput.addEventListener('change', () => setLoopFile(loopFileInput.files[0]));

loopDropZone.addEventListener('dragover', e => { e.preventDefault(); loopDropZone.classList.add('dragover'); });
loopDropZone.addEventListener('dragleave', () => loopDropZone.classList.remove('dragover'));
loopDropZone.addEventListener('drop', e => {
  e.preventDefault();
  loopDropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setLoopFile(file);
});

loopStartBtn.addEventListener('click', async () => {
  if (!loopFile) return;
  loopStartBtn.disabled = true;
  showProgress('loop', true);
  setProgress('loop', 0, Infinity);
  setStatus('loop', '');

  try {
    await createLoop(loopFile, {
      onStatus: msg => setFfmpegStatus('loop', msg),
      onProgress: (ratio, eta) => setProgress('loop', ratio, eta),
    });
    setProgress('loop', 1, 0);
    setStatus('loop', 'Download started!', 'success');
  } catch (err) {
    console.error('Loop error:', err);
    setStatus('loop', `Error: ${err?.message || String(err)}`, 'error');
  } finally {
    loopStartBtn.disabled = false;
  }
});
