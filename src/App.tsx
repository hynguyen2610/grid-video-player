import { useEffect, useRef, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { VideoCell } from './components/VideoCell';
import { getGridVideoApi } from './lib/grid-video-api';
import { maxCells, selectSession, useGridStore } from './state/grid-store';
import type { Cell, Preset, SourceType } from './shared/types';

function App() {
  const videoMap = useRef(new Map<string, HTMLVideoElement>());
  const persistTimer = useRef<number | null>(null);
  const api = getGridVideoApi();

  const {
    cells,
    presets,
    recentSources,
    hydrated,
    columns,
    tier,
    addCell,
    removeCell,
    replaceCellSource,
    setResolvedSource,
    setCellPlayback,
    setCellMuted,
    setCellVolume,
    setCellTime,
    setCellStatus,
    savePreset,
    deletePreset,
    loadPreset,
    importPreset,
    rememberRecentSource,
    hydrateSession
  } = useGridStore();

  useEffect(() => {
    void api.loadSession().then((session) => {
      hydrateSession(session);
    });
  }, [api, hydrateSession]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
    }

    persistTimer.current = window.setTimeout(() => {
      void api.saveSession(selectSession(useGridStore.getState()));
    }, 250);
  }, [api, cells, hydrated, presets, recentSources]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, []);

  async function assignSourceToCell(
    cellId: string,
    payload: { source: string; sourceType: SourceType; label: string }
  ) {
    replaceCellSource(cellId, payload.source, payload.sourceType, payload.label);
    rememberRecentSource(payload.source);
    try {
      const resolved = await api.resolveSource(cellId, payload.source, payload.sourceType);
      setResolvedSource(cellId, resolved.playbackUrl, resolved.isLive);
    } catch (error) {
      setCellStatus(cellId, 'error', error instanceof Error ? error.message : 'Source resolution failed');
    }
  }

  async function handleAddClick() {
    if (cells.length >= maxCells) {
      return;
    }

    const selection = await api.selectLocalVideo();
    if (!selection) {
      return;
    }

    const id = addCell({
      label: selection.label || `Cell ${cells.length + 1}`
    });
    if (id) {
      await assignSourceToCell(id, {
        source: selection.source,
        sourceType: 'local',
        label: selection.label || `Cell ${cells.length + 1}`
      });
    }
  }

  function handleRemove(id: string) {
    const cell = cells.find((entry) => entry.id === id);
    if (cell?.sourceType === 'rtsp') {
      void api.stopRtspBridge(id);
    }
    videoMap.current.delete(id);
    removeCell(id);
  }

  async function changeLocalVideo(id: string) {
    const selection = await api.selectLocalVideo();
    if (!selection) {
      return;
    }

    await assignSourceToCell(id, {
      source: selection.source,
      sourceType: 'local',
      label: selection.label
    });
  }

  function registerVideo(id: string, element: HTMLVideoElement | null) {
    if (element) {
      videoMap.current.set(id, element);
    } else {
      videoMap.current.delete(id);
    }
  }

  function applyToAllVideos(callback: (cell: Cell, element?: HTMLVideoElement) => void) {
    cells.forEach((cell) => {
      callback(cell, videoMap.current.get(cell.id));
    });
  }

  function syncPlayback() {
    const seekableTimes = cells
      .filter((cell) => !cell.isLive)
      .map((cell) => cell.currentTime)
      .filter((value) => Number.isFinite(value));
    const target = seekableTimes.length > 0 ? Math.min(...seekableTimes) : 0;

    applyToAllVideos((cell, element) => {
      if (!cell.isLive && element) {
        element.currentTime = target;
        setCellTime(cell.id, target, cell.duration);
      }
    });
  }

  async function screenshotAll() {
    const shots = cells.flatMap((cell) => {
      const element = videoMap.current.get(cell.id);
      if (!element || element.videoWidth === 0 || element.videoHeight === 0) {
        return [];
      }

      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return [];
      }

      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      return [{ cellId: cell.id, dataUrl: canvas.toDataURL('image/png') }];
    });

    if (shots.length > 0) {
      await api.saveScreenshots(shots);
    }
  }

  async function handleSavePreset() {
    const name = window.prompt('Preset name');
    if (name?.trim()) {
      savePreset(name.trim());
    }
  }

  async function handleImportPreset() {
    const preset = await api.importPreset();
    if (preset) {
      importPreset(preset);
      loadPreset(preset);
    }
  }

  async function handleExportPreset(preset: Preset) {
    await api.exportPreset(preset);
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const unresolved = cells.filter(
      (cell) => cell.source && cell.sourceType && !cell.resolvedSource && cell.status === 'idle'
    );
    unresolved.forEach((cell) => {
      void assignSourceToCell(cell.id, {
        source: cell.source!,
        sourceType: cell.sourceType!,
        label: cell.label
      });
    });
  }, [cells, hydrated]);

  const compact = tier === 'dense';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1e2841,transparent_32%),linear-gradient(180deg,#0a0d14_0%,#0d1220_100%)] text-white">
      <Toolbar
        onAdd={handleAddClick}
        onPlayAll={() => applyToAllVideos((cell) => setCellPlayback(cell.id, true))}
        onPauseAll={() => applyToAllVideos((cell) => setCellPlayback(cell.id, false))}
        onMuteAll={(muted) => applyToAllVideos((cell) => setCellMuted(cell.id, muted))}
        onSyncAll={syncPlayback}
        onScreenshotAll={() => void screenshotAll()}
        onSavePreset={() => void handleSavePreset()}
        onImportPreset={() => void handleImportPreset()}
        presets={presets}
        onLoadPreset={(preset) => loadPreset(preset)}
        onDeletePreset={(presetId) => deletePreset(presetId)}
        onExportPreset={(preset) => void handleExportPreset(preset)}
      />

      <main className="p-5">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >
          {cells.map((cell) => (
            <VideoCell
              key={cell.id}
              cell={cell}
              compact={compact}
              onPlayChange={setCellPlayback}
              onMutedChange={setCellMuted}
              onVolumeChange={setCellVolume}
              onTimeChange={setCellTime}
              onStatusChange={setCellStatus}
              onChangeSource={(id) => void changeLocalVideo(id)}
              onRemove={handleRemove}
              registerVideo={registerVideo}
            />
          ))}

          <button
            data-testid="grid-add-tile"
            type="button"
            onClick={() => void handleAddClick()}
            disabled={cells.length >= maxCells}
            className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-accent/60 bg-card/40 p-8 text-center transition hover:border-accent hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="rounded-full border border-accent/70 px-5 py-4 text-3xl text-accent">+</div>
            <p className="mt-5 text-lg font-medium text-white">
              {cells.length >= maxCells ? 'Maximum cells reached' : 'Add Video'}
            </p>
            <p className="mt-2 max-w-xs text-sm text-slate-400">
              Place a local file or stream source into the next slot. The grid reflows automatically.
            </p>
          </button>
        </div>

        {cells.length === 0 ? (
          <div className="mt-16 text-center text-slate-400">
            <p className="text-xl text-white">The grid is empty.</p>
            <p className="mt-2 text-sm">Use the add tile or toolbar to start building a playback wall.</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
