# Grid Video Player

Electron desktop app scaffold for the multi-video grid player spec. The current implementation includes:

- Electron main/preload setup with IPC for persistence, file picking, preset import/export, screenshots, and source validation
- React renderer with a dynamic grid, per-cell playback controls, toolbar actions, source picker dialog, and persisted session state
- Playback adapters for native video, HLS.js, DASH.js, and an FFmpeg-backed RTSP-to-HLS bridge
- Utility tests for grid sizing and source-type detection

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test`

## Notes

- RTSP playback expects `ffmpeg` to be installed and available on `PATH`
- Packaged app signing/bundling and cross-platform verification are not implemented yet
- Stream validation uses lightweight connectivity checks and may need hardening for production networks
