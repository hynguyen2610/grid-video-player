# Multi-Video Grid Player — Desktop App Specification

**Version:** 1.1
**Platform:** Desktop (macOS, Windows, Linux)
**Stack:** Electron · React · Tailwind · Zustand

---

## 1. Overview

A desktop application that plays multiple video sources simultaneously in a configurable grid layout. Users add videos one at a time via an **Add** button — the grid grows and reflows automatically. Each cell has its own full set of playback controls. Videos can be removed individually, shrinking the grid accordingly.

---

## 2. Core Features

### 2.1 Grid Behavior

- Grid starts empty with a single **+ Add Video** button
- Each time a video is added, it occupies a new cell — the grid reflows to fit
- Grid columns auto-calculate based on cell count to maintain a balanced layout:

| Cell count | Columns |
|---|---|
| 1 | 1 |
| 2–4 | 2 |
| 5–9 | 3 |
| 10–16 | 4 |
| 17–25 | 5 |
| 26–36 | 6 |

- Maximum 36 simultaneous cells
- The **+ Add Video** button is always the last item in the grid, after all active cells
- Removing a cell collapses the grid and reflows remaining cells
- Grid state (sources, layout, playback positions) persists across sessions
- The library sidebar remains independently scrollable at all times
- Layout mode applies only to the video grid canvas:
  - `Fit to Viewport` keeps the full grid visible inside the available grid area
  - `Scrolling` allows only the grid area to scroll when the wall grows taller than the viewport

---

### 2.2 Video Sources

Each cell holds one video source. Supported source types:

| Type | Format | Notes |
|---|---|---|
| Local file | MP4, MKV, MOV, AVI, WebM | Native `<video>` element |
| HLS stream | `.m3u8` | Via HLS.js |
| DASH stream | `.mpd` | Via dash.js |
| RTSP stream | `rtsp://` | FFmpeg bridge in main process → HLS |

---

### 2.3 Per-Cell Controls

Each cell has its own persistent control bar, always visible at the bottom of the cell (not hover-only):

```
┌─────────────────────────────────────────────┐
│                                             │
│                [video frame]                │
│                                             │
├─────────────────────────────────────────────┤
│ ▶  ━━━━━━●━━━━━━━━━━━  🔊━━●━  🔇  📁  ✕  │
│play    timeline        volume mute chg  rem │
└─────────────────────────────────────────────┘
```

**Controls (left to right):**

| Control | Behavior |
|---|---|
| **Play / Pause** | Toggles playback for this cell only. Icon switches between ▶ and ⏸ |
| **Timeline** | Seek bar showing elapsed / total duration. Draggable scrubber; shows timestamp tooltip on hover. Hidden for live streams (replaced by a live indicator badge) |
| **Volume** | Horizontal slider, 0–100%. Always visible alongside mute |
| **Mute** | Toggles mute for this cell only. Icon reflects current state (🔊 / 🔇). Independent of volume slider value |
| **Change Video** | Opens the Source Picker dialog. Replaces the current source and resets playback to 0:00 |
| **Remove** | Removes this cell entirely. Grid reflows and remaining cells re-index |

**Control bar behavior:**
- Always visible — not hidden behind hover
- Scales down at smaller cell sizes (icons only, no labels, sliders shrink) — text labels appear only when cell width > 320px
- At 5×5 and 6×6 grids, timeline and volume collapse into icon-only tap targets to preserve space

---

### 2.4 Global Controls

Applied across all active cells simultaneously, located in the top toolbar:

- Play all / Pause all
- Mute all / Unmute all
- Sync playback (align all local file playheads to the same timestamp)
- Screenshot all (capture current frame of every cell)

---

### 2.5 Layout Management

- Save current grid layout + sources as a named **preset**
- Load saved presets
- Delete presets
- Export preset as JSON file
- Import preset from JSON file

Preset JSON shape:
```json
{
  "name": "Security Cameras",
  "columns": 3,
  "rows": 2,
  "cells": [
    { "index": 0, "label": "Front Door", "source": "rtsp://192.168.1.10/stream" },
    { "index": 1, "label": "Garage", "source": "/videos/garage.mp4" },
    { "index": 2, "label": "Empty", "source": null }
  ]
}
```

---

## 3. UI Layout

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: Presets | Play All | Pause All | Mute All  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────┐  ┌────────────────┐              │
│  │   [video]      │  │   [video]      │              │
│  ├────────────────┤  ├────────────────┤              │
│  │▶ ━━●━━ 🔊━● 🔇📁✕│  │▶ ━━●━━ 🔊━● 🔇📁✕│              │
│  └────────────────┘  └────────────────┘              │
│                                                      │
│  ┌────────────────┐  ┌────────────────┐              │
│  │   [video]      │  │                │              │
│  ├────────────────┤  │   + Add Video  │              │
│  │▶ ━━●━━ 🔊━● 🔇📁✕│  │                │              │
│  └────────────────┘  └────────────────┘              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- **Toolbar** — fixed top bar, always visible; houses global controls and preset management
- **Library sidebar** — fixed within the app shell with its own vertical scroll region independent from the grid
- **Active cell** — video frame above, persistent control bar below
- **Add Video button** — always the last item in the grid; clicking opens the Source Picker dialog; styled distinctly from active cells (dashed border, centered `+` icon)
- Grid reflows automatically as cells are added or removed

---

## 4. Grid Rendering

### 4.1 Layout

CSS Grid drives the layout:

```css
display: grid;
grid-template-columns: repeat({columns}, 1fr);
grid-template-rows: repeat({rows}, 1fr);
gap: 4px;
```

Cells scale proportionally to fill the available window area. Aspect ratio per cell is maintained at 16:9 where possible; falls back to fill if source has different ratio.

### 4.2 Performance Scaling

As grid size grows, per-cell resolution is automatically capped to avoid decode bottlenecks:

| Grid size | Max resolution per cell |
|---|---|
| 1×1 – 2×2 | 1080p |
| 3×3 | 720p |
| 4×4 | 480p |
| 5×5 – 6×6 | 360p |

For local files this is a render constraint only (the file is not re-encoded). For streams, resolution hints are passed to HLS.js quality selection.

---

## 5. Architecture

### 5.1 Process Model (Electron)

```
Main Process
  ├── FFmpeg bridge (RTSP → HLS transcoding)
  ├── Local file serving (http://localhost for <video> src)
  ├── Preset persistence (electron-store)
  └── IPC handlers

Renderer Process
  ├── React UI
  ├── Zustand state (grid config, cell states)
  ├── HLS.js instances (one per HLS/RTSP cell)
  └── <video> elements (one per cell)
```

### 5.2 State Shape (Zustand)

```ts
interface GridStore {
  cells: Cell[];
  presets: Preset[];

  addCell: (source: string, sourceType: Cell['sourceType']) => void;
  removeCell: (id: string) => void;
  setCellSource: (id: string, source: string, sourceType: Cell['sourceType']) => void;
  setCellPlayback: (id: string, playing: boolean) => void;
  setCellVolume: (id: string, volume: number) => void;
  setCellMuted: (id: string, muted: boolean) => void;
  setCellTime: (id: string, currentTime: number) => void;
  savePreset: (name: string) => void;
  loadPreset: (preset: Preset) => void;
}

interface Cell {
  id: string;                                         // uuid
  source: string | null;
  sourceType: 'local' | 'hls' | 'dash' | 'rtsp' | null;
  playing: boolean;
  muted: boolean;
  volume: number;                                     // 0–100
  currentTime: number;                                // seconds
  duration: number | null;                            // null for live streams
}
```

### 5.3 RTSP Handling

RTSP sources are not natively supported by the browser's `<video>` element. Flow:

```
Renderer: requests RTSP source
  → IPC call to main process
  → Main spawns FFmpeg: rtsp://... → HLS segments → local temp dir
  → Main serves HLS via localhost HTTP
  → Returns m3u8 URL to renderer
  → Renderer loads via HLS.js
```

FFmpeg process lifecycle is tied to the cell — killed when cell source is removed or app closes.

---

## 6. Source Picker Dialog

Opened when clicking an empty cell or editing an existing source:

- **Tab 1 — Local File:** file system browser, filtered to supported formats
- **Tab 2 — Stream URL:** text input accepting HLS, DASH, or RTSP URLs
- **Validate button:** tests connectivity before confirming
- **Recent sources:** last 10 sources used, persisted across sessions

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| App startup time | < 3 seconds |
| Grid reconfiguration | < 500ms reflow |
| RTSP stream first frame | < 5 seconds from source add |
| HLS stream first frame | < 3 seconds from source add |
| Memory per active cell | < 150MB (1080p local), < 80MB (stream) |
| CPU idle (all cells playing) | < 30% on 4-core machine at 2×2 |

---

## 8. Out of Scope (v1.0)

- Audio mixing across cells
- Recording / capture to file
- PTZ camera control
- Motion detection or AI overlays
- Mobile or web version
- DRM-protected stream playback
