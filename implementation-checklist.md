# Multi-Video Grid Player Implementation Checklist

Implementation checklist derived from [grid-video-player-spec.md](/Users/hdnguyen/Documents/dev/node/grid-video/grid-video-player-spec.md:1).

## 1. Project Foundation

- [ ] Initialize Electron + React + Tailwind + Zustand desktop app scaffold
- [ ] Set up main/renderer process structure with shared TypeScript types
- [ ] Configure development workflow for Electron renderer reload and main process restart
- [ ] Add linting, formatting, and typechecking
- [ ] Add build pipeline for macOS, Windows, and Linux packaging
- [ ] Decide app data storage locations for presets, recent sources, and session restore

## 2. App Shell and Layout

- [ ] Build top-level app shell with fixed toolbar and resizable grid area
- [ ] Keep the library sidebar independently scrollable regardless of grid layout mode
- [ ] Add empty-state layout with a single `+ Add Video` action
- [ ] Implement CSS grid container with dynamic column calculation
- [ ] Implement row calculation from cell count and selected column count
- [ ] Keep the `+ Add Video` tile as the last grid item at all times
- [ ] Reflow layout automatically when cells are added or removed
- [ ] Maintain usable spacing and sizing at 1x1 through 6x6 layouts
- [ ] Scope fit-vs-scroll layout mode changes to the grid viewport only, not the sidebar or app shell
- [ ] Preserve 16:9 presentation where possible and define fallback behavior for non-16:9 sources

## 3. State Management

- [ ] Define `Cell`, `Preset`, and store interfaces for renderer state
- [ ] Implement Zustand store for cells, playback state, presets, and recent sources
- [ ] Track per-cell source, source type, playing state, muted state, volume, current time, and duration
- [ ] Track enough metadata to distinguish live streams from seekable sources
- [ ] Add derived selectors for column count, row count, grid size tier, and max-cell guard
- [ ] Enforce the 36-cell maximum in store actions and UI
- [ ] Persist store-backed session state across app restarts

## 4. Source Picker Dialog

- [ ] Build modal/dialog entry point for both add and change-source flows
- [ ] Add `Local File` tab with file picker filtered to MP4, MKV, MOV, AVI, and WebM
- [ ] Add `Stream URL` tab with validation for HLS, DASH, and RTSP inputs
- [ ] Implement source validation flow before confirming selection
- [ ] Show clear error states for unsupported formats, unreachable URLs, and failed validation
- [ ] Persist and display the 10 most recent sources
- [ ] Reuse the dialog for replacing an existing cell source

## 5. Video Cell Component

- [ ] Build a reusable grid cell component with video surface and persistent bottom control bar
- [ ] Add loading, error, and empty-source states
- [ ] Display a live badge instead of timeline controls for live streams
- [ ] Add optional cell label support if presets provide names later
- [ ] Ensure each cell owns its own playback and control state bindings

## 6. Per-Cell Controls

- [ ] Implement play/pause toggle per cell
- [ ] Implement timeline scrubber for seekable sources
- [ ] Show elapsed time and total duration for seekable sources
- [ ] Add timeline hover timestamp tooltip
- [ ] Hide timeline for live streams and replace it with a live indicator
- [ ] Implement horizontal volume slider with 0-100 mapping
- [ ] Implement independent mute toggle behavior
- [ ] Implement `Change Video` action that resets playback to `0:00`
- [ ] Implement `Remove` action that deletes the cell and reflows the grid
- [ ] Add responsive control density rules for small cells
- [ ] Show labels only when cell width is greater than 320px
- [ ] Collapse timeline and volume to compact/icon-first controls for 5x5 and 6x6 grids

## 7. Playback Engine Integration

- [ ] Implement native local-file playback using the HTML `<video>` element
- [ ] Implement HLS playback with HLS.js
- [ ] Implement DASH playback with dash.js
- [ ] Implement source-type detection from file selection or URL pattern
- [ ] Normalize video event handling across native, HLS, DASH, and RTSP-backed playback
- [ ] Handle autoplay restrictions and promise rejections cleanly in Electron
- [ ] Ensure source replacement tears down old playback resources before attaching new ones

## 8. RTSP Bridge in Main Process

- [ ] Add IPC request flow for RTSP source creation from renderer to main process
- [ ] Spawn FFmpeg process per RTSP cell
- [ ] Transcode RTSP input into HLS segments in a temp directory
- [ ] Serve generated HLS output over a local HTTP endpoint
- [ ] Return renderer-consumable `.m3u8` URLs from the main process
- [ ] Kill FFmpeg when a cell is removed, source is changed, or app exits
- [ ] Clean up temp files and orphaned processes on shutdown and crash recovery
- [ ] Add timeout and error reporting for unreachable RTSP sources

## 9. Global Toolbar Controls

- [ ] Build toolbar UI for playback actions and preset management
- [ ] Implement `Play All`
- [ ] Implement `Pause All`
- [ ] Implement `Mute All`
- [ ] Implement `Unmute All`
- [ ] Implement `Sync Playback` for local files using a shared target timestamp
- [ ] Define behavior for non-seekable/live cells during sync
- [ ] Implement `Screenshot All` for current frame capture per active cell
- [ ] Define output location and file naming for screenshots

## 10. Presets and Persistence

- [ ] Define preset model compatible with the spec JSON shape
- [ ] Implement save-current-layout as named preset
- [ ] Implement preset loading into active grid state
- [ ] Implement preset deletion
- [ ] Implement preset export to JSON file
- [ ] Implement preset import from JSON file with validation
- [ ] Decide how partially empty grids are represented when loading presets
- [ ] Persist presets with `electron-store` or equivalent app-local storage

## 11. Session Restore

- [ ] Restore active cells and their order on app launch
- [ ] Restore per-cell playback position for seekable sources
- [ ] Restore volume and mute state per cell
- [ ] Restore grid layout derived from restored cells
- [ ] Define restart behavior for live streams and RTSP sources
- [ ] Prevent restoring broken or unavailable sources without user feedback

## 12. Performance and Quality Scaling

- [ ] Implement grid-tier detection for 1x1 through 6x6
- [ ] Cap effective per-cell render quality based on grid size tier
- [ ] Add stream quality hinting for HLS playback tiers
- [ ] Verify local-file rendering remains decode-safe without re-encoding
- [ ] Avoid unnecessary rerenders across many active cells
- [ ] Ensure teardown paths release HLS.js, dash.js, FFmpeg, and video resources promptly

## 13. Error Handling and UX Polish

- [ ] Add friendly errors for failed loads, invalid files, unsupported codecs, and stream disconnects
- [ ] Add retry path for stream-based sources
- [ ] Show per-cell loading indicators until first frame is ready
- [ ] Disable add flow when max cell count is reached
- [ ] Confirm destructive actions only if the UX needs protection against accidental removal
- [ ] Make keyboard focus states visible for toolbar and cell controls
- [ ] Ensure the interface works across light/dark OS themes if system styling is inherited

## 14. Testing

- [ ] Add unit tests for grid column/row calculation
- [ ] Add unit tests for source-type detection
- [ ] Add unit tests for store actions: add, remove, replace, volume, mute, time, preset save/load
- [ ] Add integration tests for source picker validation flows
- [ ] Add integration tests for add/remove/reflow behavior
- [ ] Add integration tests for session persistence and restore
- [ ] Add integration tests for global controls
- [ ] Add smoke coverage for RTSP bridge lifecycle with mocked FFmpeg where practical

## 15. Performance Validation

- [ ] Measure startup time against the `< 3 seconds` target
- [ ] Measure grid reflow against the `< 500ms` target
- [ ] Measure HLS first-frame time against the `< 3 seconds` target
- [ ] Measure RTSP first-frame time against the `< 5 seconds` target
- [ ] Measure memory usage per active cell for local and stream sources
- [ ] Measure CPU usage for a 2x2 all-playing scenario on a 4-core machine
- [ ] Record bottlenecks and mitigations before packaging

## 16. Packaging and Release Readiness

- [ ] Verify packaged app behavior on macOS
- [ ] Verify packaged app behavior on Windows
- [ ] Verify packaged app behavior on Linux
- [ ] Confirm FFmpeg bundling/distribution strategy per platform
- [ ] Confirm local HTTP serving and file access permissions in packaged builds
- [ ] Add release notes for supported formats, limits, and known v1 constraints

## 17. Explicit Spec Gaps to Decide Before Implementation

- [ ] Choose whether empty cells are ever persisted in active session state, or only in imported presets
- [ ] Choose whether `Play All` affects cells that previously errored or are still loading
- [ ] Choose how `Screenshot All` handles cross-origin or stream-backed frames if capture fails
- [ ] Choose whether cell labels are editable in v1 or only carried through presets/imports
- [ ] Choose whether `Sync Playback` snaps all local files to the minimum, maximum, or current initiating timestamp
- [ ] Choose what `Validate` means for local files versus stream URLs
