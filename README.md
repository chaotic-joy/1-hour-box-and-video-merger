# Video Merger & 1-Hour Looper

A browser-based tool for merging videos and creating 1-hour loops. All processing runs entirely in your browser via FFmpeg.wasm — no uploads, no server, no installs.

## Features

**Merge** — Combine multiple video files into a single MP4. Videos without audio automatically get a silent audio track so playback is consistent.

**1-Hour Loop** — Take any video and repeat it until it's at least one hour long. Uses a fast two-pass approach: encodes the source clip once, then stitches copies without re-encoding.

**Output format** — All exports are H.264 MP4, 1080p, 30fps, ≤2000kbps, AAC stereo audio. Compatible with Samsung, LG, Sony, and other smart TVs via USB.

## Usage

Open the app in Chrome (required for SharedArrayBuffer + WASM threads), pick your files, and click Merge or Loop. The output downloads automatically when done.

## Development

**Prerequisites:** Node.js, npm

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome.

**Build for production:**

```bash
npm run build
```

## Deployment

Hosted on Netlify. The `netlify.toml` sets the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers for SharedArrayBuffer support.
