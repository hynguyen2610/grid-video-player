# Playwright Implementation Checklist

Playwright rollout checklist for end-to-end coverage of the grid video player.

## 1. Test Harness Foundation

- [ ] Add Playwright as a dev dependency
- [ ] Choose test target strategy: Electron app launch, browser-only renderer, or both
- [ ] Add Playwright config for local development and CI
- [ ] Add scripts for headed, headless, debug, and CI test runs
- [ ] Add artifact output folders for traces, videos, and screenshots
- [ ] Add `.gitignore` coverage for Playwright artifacts if needed
- [ ] Decide the baseline viewport and OS matrix for test execution

## 2. Electron Launch Strategy

- [ ] Implement Playwright launch helper for the Electron app
- [ ] Ensure tests can wait for the renderer window to be ready
- [ ] Expose a stable way to seed app state before launch
- [ ] Expose a stable way to clear persisted app state between tests
- [ ] Add helpers to close the app cleanly after each test
- [ ] Decide whether file dialogs are mocked, bypassed, or exercised through test-only IPC hooks

## 3. Test Data and Fixtures

- [ ] Create small local sample videos for deterministic tests
- [ ] Add fixture coverage for at least one seekable local MP4
- [ ] Add fixture coverage for unsupported local file selection
- [ ] Add fixture coverage for HLS test content
- [ ] Add fixture coverage for DASH test content
- [ ] Add fixture coverage for RTSP behavior through a mocked bridge or controlled local source
- [ ] Add malformed URL fixtures for validation failures
- [ ] Add preset JSON fixtures: valid, invalid, partial, and duplicate-name cases

## 4. Test Helpers

- [ ] Add selectors/helpers for toolbar actions
- [ ] Add selectors/helpers for the add tile and source picker dialog
- [ ] Add selectors/helpers for video cells by label or index
- [ ] Add helpers for waiting on cell state transitions: loading, ready, error
- [ ] Add helpers for interacting with sliders, toggles, and seek bars
- [ ] Add helpers for filesystem assertions on exported presets and saved screenshots
- [ ] Add helpers for relaunching the app and validating session restore

## 5. Smoke Coverage

- [ ] Verify the app launches to an empty grid
- [ ] Verify the toolbar is visible on launch
- [ ] Verify the `+ Add Video` tile is visible on launch
- [ ] Verify the add tile remains the last grid item after cells are added
- [ ] Verify the app closes without renderer or main-process errors in the happy path

## 6. Grid Layout Behavior

- [ ] Verify 1 cell renders as a 1-column layout
- [ ] Verify 2-4 cells render as a 2-column layout
- [ ] Verify 5-9 cells render as a 3-column layout
- [ ] Verify 10-16 cells render as a 4-column layout
- [ ] Verify 17-25 cells render as a 5-column layout
- [ ] Verify 26-36 cells render as a 6-column layout
- [ ] Verify removing a cell reflows the remaining grid correctly
- [ ] Verify the add tile is disabled or blocked at 36 cells

## 7. Source Picker Dialog

- [ ] Verify clicking the add tile opens the source picker dialog
- [ ] Verify clicking `Change Video` opens the same dialog flow
- [ ] Verify the `Local File` tab is available
- [ ] Verify the `Stream URL` tab is available
- [ ] Verify cancel closes the dialog without adding a source
- [ ] Verify cancel after creating a pending empty cell does not leave an orphan cell behind
- [ ] Verify local file browsing populates the selected path
- [ ] Verify recent sources are shown when available
- [ ] Verify selecting a recent source populates the input
- [ ] Verify validation errors are shown for unsupported file types
- [ ] Verify validation errors are shown for malformed or unreachable stream URLs
- [ ] Verify successful validation adds the cell and closes the dialog

## 8. Local File Playback

- [ ] Verify a supported local file can be added to the grid
- [ ] Verify the video cell leaves loading state after the source resolves
- [ ] Verify play/pause toggles affect only the targeted cell
- [ ] Verify seek bar is shown for seekable local files
- [ ] Verify current time and duration are displayed for seekable local files
- [ ] Verify scrubbing updates the playhead
- [ ] Verify mute toggles affect only the targeted cell
- [ ] Verify volume slider updates the targeted cell volume
- [ ] Verify `Change Video` replaces the source and resets playback time
- [ ] Verify `Remove` deletes the cell and reflows the grid

## 9. HLS Playback

- [ ] Verify a valid HLS URL can be added
- [ ] Verify the HLS cell becomes ready and attempts playback
- [ ] Verify live-style HLS hides the seek bar if duration is unavailable
- [ ] Verify cell-level mute, volume, and remove actions still work for HLS
- [ ] Verify invalid HLS manifest handling shows an error state

## 10. DASH Playback

- [ ] Verify a valid DASH URL can be added
- [ ] Verify the DASH cell becomes ready and attempts playback
- [ ] Verify per-cell controls still work for DASH
- [ ] Verify invalid DASH manifest handling shows an error state

## 11. RTSP Playback

- [ ] Verify an RTSP URL triggers the main-process bridge flow
- [ ] Verify the renderer receives an HLS playback URL from the bridge
- [ ] Verify RTSP cells show live-style UI instead of seek controls
- [ ] Verify removing an RTSP cell stops the bridge session
- [ ] Verify changing an RTSP source tears down the previous bridge session
- [ ] Verify RTSP connection failures surface a visible error state
- [ ] Verify app shutdown cleans up active RTSP bridge sessions

## 12. Per-Cell Controls

- [ ] Verify control bar is always visible without hover
- [ ] Verify play/pause icon or label changes with playback state
- [ ] Verify mute icon or label changes with mute state
- [ ] Verify timeline is hidden for live sources
- [ ] Verify live badge is shown for live sources
- [ ] Verify controls remain usable on smaller cell sizes
- [ ] Verify compact-density behavior in 5x5 and 6x6 layouts
- [ ] Verify labels appear only when the cell is wide enough, if that behavior is implemented

## 13. Global Toolbar Controls

- [ ] Verify `Play All` marks all playable cells as playing
- [ ] Verify `Pause All` marks all active cells as paused
- [ ] Verify `Mute All` marks all active cells as muted
- [ ] Verify `Unmute All` clears mute on all active cells
- [ ] Verify global actions do not crash when no cells are present
- [ ] Verify `Sync Playback` aligns all local file playheads to the expected timestamp
- [ ] Verify `Sync Playback` ignores live or non-seekable cells cleanly
- [ ] Verify `Screenshot All` saves image files for every capturable cell
- [ ] Verify `Screenshot All` handles non-capturable cells gracefully

## 14. Presets

- [ ] Verify saving the current layout creates a named preset
- [ ] Verify saved presets appear in the toolbar/list
- [ ] Verify loading a preset restores the expected cells and labels
- [ ] Verify deleting a preset removes it from persisted state
- [ ] Verify exporting a preset writes a valid JSON file
- [ ] Verify importing a valid preset adds it and allows loading it
- [ ] Verify importing invalid JSON shows a safe failure path
- [ ] Verify importing a preset with null or empty cells behaves as intended

## 15. Session Persistence

- [ ] Verify active cells persist across app relaunch
- [ ] Verify local-file playback positions persist across app relaunch
- [ ] Verify mute state persists across app relaunch
- [ ] Verify volume state persists across app relaunch
- [ ] Verify recent sources persist across app relaunch
- [ ] Verify presets persist across app relaunch
- [ ] Verify broken sources on restore show an understandable error path

## 16. Error and Recovery Paths

- [ ] Verify invalid local file paths do not crash the app
- [ ] Verify unreachable stream URLs show a validation or playback error
- [ ] Verify source resolution failures show a cell error state
- [ ] Verify repeated add/remove cycles do not leave ghost cells behind
- [ ] Verify removing a cell during loading does not crash the app
- [ ] Verify replacing a source during loading does not leave the old source attached
- [ ] Verify the app remains usable after one cell enters an error state

## 17. Responsiveness and Density

- [ ] Verify the layout remains usable at a desktop-minimum window size
- [ ] Verify toolbar actions remain accessible when the window narrows
- [ ] Verify dense layouts still render all cells without overlapping controls
- [ ] Verify the add tile remains visible and reachable in dense layouts
- [ ] Verify scroll behavior is acceptable if the window becomes too small

## 18. Filesystem and Native Dialog Cases

- [ ] Verify local file selection filters to supported video types
- [ ] Verify preset export cancellation leaves no partial file behind
- [ ] Verify preset import cancellation leaves state unchanged
- [ ] Verify screenshot save location is created when missing
- [ ] Verify repeated screenshot captures do not overwrite prior files unexpectedly

## 19. CI and Reliability

- [ ] Add retries only for clearly flaky external media cases
- [ ] Enable Playwright trace capture on failure
- [ ] Enable screenshot capture on failure
- [ ] Decide whether video recording should be always-on or failure-only
- [ ] Split smoke tests from slower media-heavy suites
- [ ] Tag tests by area: grid, sources, controls, presets, persistence, RTSP
- [ ] Make the suite runnable in CI without manual dialogs or external network dependencies

## 20. Spec Gaps to Lock Before Full E2E Coverage

- [ ] Decide the expected `Sync Playback` target rule for assertions
- [ ] Decide how live HLS and DASH should be distinguished from seekable streams in tests
- [ ] Decide whether preset import should merge or replace on duplicate names
- [ ] Decide the expected UX when screenshot capture fails for a subset of cells
- [ ] Decide whether RTSP E2E uses real FFmpeg in CI or a mocked bridge path
- [ ] Decide whether Playwright should primarily validate the Electron shell or the renderer behavior
