import { useEffect, useRef, useState } from 'react';
import { GridConfigDialog } from './components/GridConfigDialog';
import { Toolbar } from './components/Toolbar';
import { VideoLibrarySidebar } from './components/VideoLibrarySidebar';
import { VideoCell } from './components/VideoCell';
import { getGridVideoApi, peekStoredSidebarOpen } from './lib/grid-video-api';
import { selectSession, useGridStore } from './state/grid-store';
import type { Cell, FolderVideoSelection, Preset, SourceType } from './shared/types';

function App() {
  const [gridConfigOpen, setGridConfigOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => peekStoredSidebarOpen());
  const [libraryVideos, setLibraryVideos] = useState<FolderVideoSelection[]>([]);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const videoMap = useRef(new Map<string, HTMLVideoElement>());
  const persistTimer = useRef<number | null>(null);
  const uiStateRef = useRef({
    sidebarOpen,
    libraryVideos
  });
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
    compactMode,
    addCell,
    removeCell,
    replaceCellSource,
    setResolvedSource,
    setGridSize,
    setLayoutMode,
    setCompactMode,
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
      setSidebarOpen(session?.sidebarOpen ?? true);
      setLibraryVideos(session?.libraryVideos ?? []);
      hydrateSession(session);
    });
  }, [api, hydrateSession]);

  useEffect(() => {
    uiStateRef.current = {
      sidebarOpen,
      libraryVideos
    };
  }, [libraryVideos, sidebarOpen]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
    }

    persistTimer.current = window.setTimeout(() => {
      void api.saveSession({
        ...selectSession(useGridStore.getState()),
        sidebarOpen: uiStateRef.current.sidebarOpen,
        libraryVideos: uiStateRef.current.libraryVideos
      });
    }, 250);
  }, [api, cells, columns, hydrated, layoutMode, libraryVideos, presets, recentSources, rows, sidebarOpen]);

  useEffect(() => {
    function persistImmediately() {
      if (!hydrated) {
        return;
      }

      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }

      void api.saveSession({
        ...selectSession(useGridStore.getState()),
        sidebarOpen: uiStateRef.current.sidebarOpen,
        libraryVideos: uiStateRef.current.libraryVideos
      });
    }

    window.addEventListener('pagehide', persistImmediately);
    window.addEventListener('beforeunload', persistImmediately);

    return () => {
      window.removeEventListener('pagehide', persistImmediately);
      window.removeEventListener('beforeunload', persistImmediately);
      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, [api, hydrated]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === appRootRef.current);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function assignSourceToCell(
    cellId: string,
    payload: { source: string; sourceType: SourceType; label: string; sourceKey?: string | null }
  ) {
    replaceCellSource(cellId, payload.source, payload.sourceType, payload.label, payload.sourceKey);
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
        label: selection.label || `Cell ${cells.length + 1}`,
        sourceKey: selection.sourceKey
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
      label: selection.label,
      sourceKey: selection.sourceKey
    });
  }

  async function handleDropVideo(cellId: string, payload: string) {
    try {
      const item = JSON.parse(payload) as FolderVideoSelection;
      await assignSourceToCell(cellId, {
        source: item.source,
        sourceType: 'local',
        label: item.label,
        sourceKey: item.sourceKey ?? item.source
      });
    } catch {
      return;
    }
  }

  async function handlePickFolder() {
    const selected = await api.selectVideoFolder();
    setLibraryVideos(selected);
    if (selected.length > 0) {
      setSidebarOpen(true);
    }
  }

  function handleLibraryThumbnailState(
    sourceKey: string,
    nextState: { thumbnailSource?: string; thumbnailProgress?: number }
  ) {
    setLibraryVideos((current) => {
      let changed = false;
      const nextVideos = current.map((video) => {
        if ((video.sourceKey ?? video.source) !== sourceKey) {
          return video;
        }

        const nextThumbnailSource = nextState.thumbnailSource ?? video.thumbnailSource;
        const nextThumbnailProgress = nextState.thumbnailProgress ?? video.thumbnailProgress;

        if (
          nextThumbnailSource === video.thumbnailSource &&
          nextThumbnailProgress === video.thumbnailProgress
        ) {
          return video;
        }

        changed = true;
        return {
          ...video,
          thumbnailSource: nextThumbnailSource,
          thumbnailProgress: nextThumbnailProgress
        };
      });

      return changed ? nextVideos : current;
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
        label: cell.label,
        sourceKey: cell.sourceKey
      });
    });
  }, [cells, hydrated]);

  const activeCells = cells.filter((cell) => !!cell.source);
  const activeSourceCounts = activeCells.reduce<Record<string, number>>((counts, cell) => {
    const key = cell.sourceKey ?? cell.source ?? '';
    if (!key) {
      return counts;
    }

    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const fitViewport = layoutMode === 'fit';
  const rootClassName = fitViewport
    ? 'flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#1e2841,transparent_32%),linear-gradient(180deg,#0a0d14_0%,#0d1220_100%)] text-white'
    : 'flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#1e2841,transparent_32%),linear-gradient(180deg,#0a0d14_0%,#0d1220_100%)] text-white';
  const mainClassName = fitViewport
    ? isFullscreen
      ? 'flex-1 min-w-0 overflow-hidden p-3'
      : 'flex-1 min-w-0 overflow-hidden p-5'
    : isFullscreen
      ? 'min-w-0 p-3'
      : 'min-w-0 p-5';

  return (
    <div
      ref={appRootRef}
      data-testid="app-shell"
      className={rootClassName}
    >
      {!isFullscreen ? (
        <Toolbar
          onAdd={handleAddClick}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          onOpenGridConfig={() => setGridConfigOpen(true)}
          onToggleFullscreen={() => void toggleFullscreen()}
          isFullscreen={isFullscreen}
          sidebarOpen={sidebarOpen}
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

      <div className={`${fitViewport ? 'flex min-h-0 flex-1' : 'flex flex-1'}`}>
        {!isFullscreen ? (
          <VideoLibrarySidebar
            open={sidebarOpen}
            videos={libraryVideos}
            activeCounts={activeSourceCounts}
            onToggle={() => setSidebarOpen((value) => !value)}
            onPickFolder={() => void handlePickFolder()}
            onThumbnailStateChange={handleLibraryThumbnailState}
          />
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
                compact={compactMode}
                isEmpty={!cell.source}
                maxColumns={columns}
                maxRows={rows}
                onAddSource={(id) => void changeLocalVideo(id)}
                onDropSource={(id, payload) => void handleDropVideo(id, payload)}
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
              <p className="mt-2 text-sm">Choose grid size, pick a folder, and drag videos into any slot.</p>
            </div>
          ) : null}
        </main>
      </div>

      <GridConfigDialog
        open={gridConfigOpen}
        initialRows={rows}
        initialColumns={columns}
        initialLayoutMode={layoutMode}
        initialCompactMode={compactMode}
        onClose={() => setGridConfigOpen(false)}
        onApply={(nextRows, nextColumns, nextLayoutMode, nextCompactMode) => {
          setGridSize(nextRows, nextColumns);
          setLayoutMode(nextLayoutMode);
          setCompactMode(nextCompactMode);
        }}
      />
    </div>
  );
}

export default App;
