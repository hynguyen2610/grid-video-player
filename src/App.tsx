import { useEffect, useRef, useState } from 'react';
import { GridConfigDialog } from './components/GridConfigDialog';
import { Toolbar } from './components/Toolbar';
import { VideoCell } from './components/VideoCell';
import { getGridVideoApi } from './lib/grid-video-api';
import { selectSession, useGridStore } from './state/grid-store';
import type { Cell, Preset, SourceType } from './shared/types';

function App() {
  const [gridConfigOpen, setGridConfigOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const videoMap = useRef(new Map<string, HTMLVideoElement>());
  const persistTimer = useRef<number | null>(null);
  const api = getGridVideoApi();

  const {
    cells,
    presets,
    recentSources,
    hydrated,
    columns,
    rows,
    tier,
    layoutMode,
    addCell,
    removeCell,
    replaceCellSource,
    setResolvedSource,
    setGridSize,
    setLayoutMode,
    setCellPlayback,
    setCellSpan,
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
  }, [api, cells, columns, hydrated, layoutMode, presets, recentSources, rows]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === appRootRef.current);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
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

  async function selectLocalVideoPreservingFullscreen() {
    const container = appRootRef.current;
    const wasFullscreen = !!container && document.fullscreenElement === container;
    const selection = await api.selectLocalVideo();

    if (wasFullscreen && document.fullscreenElement !== container) {
      await container?.requestFullscreen?.().catch(() => undefined);
    }

    return selection;
  }

  async function handleAddClick() {
    const emptySlotCount = cells.filter((cell) => !cell.source).length;
    if (emptySlotCount === 0) {
      return;
    }

    const selection = await selectLocalVideoPreservingFullscreen();
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
    const selection = await selectLocalVideoPreservingFullscreen();
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

  async function toggleFullscreen() {
    const container = appRootRef.current;
    if (!container) {
      return;
    }

    if (document.fullscreenElement === container) {
      await document.exitFullscreen?.();
      return;
    }

    await container.requestFullscreen?.();
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
  const activeCells = cells.filter((cell) => !!cell.source);
  const fitViewport = layoutMode === 'fit';
  const rootClassName = fitViewport
    ? 'flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#1e2841,transparent_32%),linear-gradient(180deg,#0a0d14_0%,#0d1220_100%)] text-white'
    : 'min-h-screen bg-[radial-gradient(circle_at_top,#1e2841,transparent_32%),linear-gradient(180deg,#0a0d14_0%,#0d1220_100%)] text-white';
  const mainClassName = fitViewport
    ? isFullscreen
      ? 'flex-1 overflow-hidden p-3'
      : 'flex-1 overflow-hidden p-5'
    : isFullscreen
      ? 'p-3'
      : 'p-5';

  return (
    <div
      ref={appRootRef}
      data-testid="app-shell"
      className={rootClassName}
    >
      {!isFullscreen ? (
        <Toolbar
          onAdd={handleAddClick}
          onOpenGridConfig={() => setGridConfigOpen(true)}
          onToggleFullscreen={() => void toggleFullscreen()}
          isFullscreen={isFullscreen}
          onPlayAll={() => activeCells.forEach((cell) => setCellPlayback(cell.id, true))}
          onPauseAll={() => activeCells.forEach((cell) => setCellPlayback(cell.id, false))}
          onMuteAll={(muted) => activeCells.forEach((cell) => setCellMuted(cell.id, muted))}
          onSyncAll={syncPlayback}
          onScreenshotAll={() => void screenshotAll()}
          onSavePreset={() => void handleSavePreset()}
          onImportPreset={() => void handleImportPreset()}
          presets={presets}
          onLoadPreset={(preset) => loadPreset(preset)}
          onDeletePreset={(presetId) => deletePreset(presetId)}
          onExportPreset={(preset) => void handleExportPreset(preset)}
        />
      ) : null}

      {isFullscreen ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="fixed right-4 top-4 z-30 rounded-full border border-border bg-black/50 px-4 py-2 text-sm text-white backdrop-blur transition hover:border-accent"
        >
          Exit Fullscreen
        </button>
      ) : null}

      <main data-testid="app-main" className={mainClassName}>
        <div
          data-testid="video-grid"
          className={`grid gap-3 ${fitViewport ? 'h-full' : ''}`}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoFlow: 'dense',
            ...(fitViewport
              ? {
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
                }
              : {
                  gridAutoRows: isFullscreen ? 'minmax(160px, 1fr)' : 'minmax(220px, 1fr)'
                })
          }}
        >
          {cells.map((cell) => (
            <VideoCell
              key={cell.id}
              cell={cell}
              compact={compact}
              isEmpty={!cell.source}
              maxColumns={columns}
              maxRows={rows}
              onAddSource={(id) => void changeLocalVideo(id)}
              onResizeCell={setCellSpan}
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
        </div>

        {activeCells.length === 0 ? (
          <div className="mt-16 text-center text-slate-400">
            <p className="text-xl text-white">The wall is ready.</p>
            <p className="mt-2 text-sm">Choose grid size from Grid Config and add local videos to any slot.</p>
          </div>
        ) : null}
      </main>

      <GridConfigDialog
        open={gridConfigOpen}
        initialRows={rows}
        initialColumns={columns}
        initialLayoutMode={layoutMode}
        onClose={() => setGridConfigOpen(false)}
        onApply={(nextRows, nextColumns, nextLayoutMode) => {
          setGridSize(nextRows, nextColumns);
          setLayoutMode(nextLayoutMode);
        }}
      />
    </div>
  );
}

export default App;
