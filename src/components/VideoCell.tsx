import dashjs from 'dashjs';
import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cell } from '../shared/types';
import { useElementWidth } from '../hooks/useElementWidth';

interface DashPlayerHandle {
  initialize: (view: HTMLVideoElement, source: string, autoPlay: boolean) => void;
  on: (event: string, listener: () => void) => void;
  reset: () => void;
}

interface VideoCellProps {
  cell: Cell;
  compact: boolean;
  isEmpty: boolean;
  maxColumns: number;
  maxRows: number;
  onAddSource: (id: string) => void;
  onDropSource: (id: string, payload: string) => void;
  onResizeCell: (id: string, colSpan: number, rowSpan: number) => void;
  onPlayChange: (id: string, playing: boolean) => void;
  onMutedChange: (id: string, muted: boolean) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onTimeChange: (id: string, currentTime: number, duration: number | null) => void;
  onStatusChange: (id: string, status: Cell['status'], error?: string | null) => void;
  onChangeSource: (id: string) => void;
  onRemove: (id: string) => void;
  registerVideo: (id: string, element: HTMLVideoElement | null) => void;
}

function formatTime(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'LIVE';
  }

  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export function VideoCell({
  cell,
  compact,
  isEmpty,
  maxColumns,
  maxRows,
  onAddSource,
  onDropSource,
  onResizeCell,
  onPlayChange,
  onMutedChange,
  onVolumeChange,
  onTimeChange,
  onStatusChange,
  onChangeSource,
  onRemove,
  registerVideo
}: VideoCellProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const width = useElementWidth(container);
  const showLabels = width > 320 && !compact;
  const showCompactLabels = width > 300;
  const [dropActive, setDropActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    startColSpan: number;
    startRowSpan: number;
    baseWidth: number;
    baseHeight: number;
    mode: 'width' | 'height' | 'both';
  } | null>(null);

  useEffect(() => {
    registerVideo(cell.id, videoRef.current);
    return () => registerVideo(cell.id, null);
  }, [cell.id, registerVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cell.resolvedSource) {
      return;
    }

    let hls: Hls | null = null;
    let dash: DashPlayerHandle | null = null;

    onStatusChange(cell.id, 'loading');

    if (cell.sourceType === 'hls') {
      if (Hls.isSupported()) {
        hls = new Hls({
          capLevelToPlayerSize: true,
          maxBufferLength: compact ? 10 : 20
        });
        hls.loadSource(cell.resolvedSource);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => onStatusChange(cell.id, 'ready'));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          onStatusChange(cell.id, 'error', data.details);
        });
      } else {
        video.src = cell.resolvedSource;
      }
    } else if (cell.sourceType === 'dash') {
      dash = dashjs.MediaPlayer().create() as DashPlayerHandle;
      dash.initialize(video, cell.resolvedSource, false);
      dash.on('error', () => onStatusChange(cell.id, 'error', 'DASH playback error'));
      onStatusChange(cell.id, 'ready');
    } else {
      video.src = cell.resolvedSource;
      onStatusChange(cell.id, 'ready');
    }

    return () => {
      hls?.destroy();
      dash?.reset();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [cell.id, cell.resolvedSource, cell.sourceType, compact, onStatusChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = cell.muted;
    video.volume = Math.max(0, Math.min(1, cell.volume / 100));

    if (cell.playing) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [cell.muted, cell.playing, cell.volume]);

  const statusText = useMemo(() => {
    if (isEmpty) {
      return 'Ready for a local file';
    }

    if (cell.status === 'error') {
      return cell.error ?? 'Playback failed';
    }

    if (cell.status === 'loading') {
      return 'Loading source...';
    }

    return cell.sourceType ? cell.sourceType.toUpperCase() : 'No source';
  }, [cell.error, cell.sourceType, cell.status]);

  function beginResize(
    event: React.MouseEvent<HTMLDivElement>,
    mode: 'width' | 'height' | 'both'
  ) {
    event.preventDefault();
    event.stopPropagation();

    const element = container;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startColSpan: cell.colSpan,
      startRowSpan: cell.rowSpan,
      baseWidth: rect.width / Math.max(cell.colSpan, 1),
      baseHeight: rect.height / Math.max(cell.rowSpan, 1),
      mode
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      let nextColSpan = resizeState.startColSpan;
      let nextRowSpan = resizeState.startRowSpan;

      if (resizeState.mode === 'width' || resizeState.mode === 'both') {
        const deltaX = moveEvent.clientX - resizeState.startX;
        nextColSpan = Math.max(
          1,
          Math.min(
            maxColumns,
            Math.round((resizeState.startColSpan * resizeState.baseWidth + deltaX) / resizeState.baseWidth)
          )
        );
      }

      if (resizeState.mode === 'height' || resizeState.mode === 'both') {
        const deltaY = moveEvent.clientY - resizeState.startY;
        nextRowSpan = Math.max(
          1,
          Math.min(
            maxRows,
            Math.round((resizeState.startRowSpan * resizeState.baseHeight + deltaY) / resizeState.baseHeight)
          )
        );
      }

      onResizeCell(cell.id, nextColSpan, nextRowSpan);
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function togglePlayback() {
    if (isEmpty || !cell.resolvedSource) {
      return;
    }

    onPlayChange(cell.id, !cell.playing);
  }

  return (
    <div
      ref={setContainer}
      data-testid={`video-cell-${cell.id}`}
      className={`group relative flex overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_20px_80px_rgba(0,0,0,0.28)] ${
        compact ? 'min-h-[180px]' : 'min-h-[220px] flex-col'
      } ${dropActive ? 'ring-2 ring-accent ring-offset-2 ring-offset-slate-950' : ''}`}
      style={{
        gridColumn: `span ${cell.colSpan}`,
        gridRow: `span ${cell.rowSpan}`
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-grid-video')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (!dropActive) {
            setDropActive(true);
          }
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        const payload = event.dataTransfer.getData('application/x-grid-video');
        if (!payload) {
          return;
        }

        event.preventDefault();
        setDropActive(false);
        onDropSource(cell.id, payload);
      }}
      onClick={() => togglePlayback()}
    >
      <div className="relative flex-1 overflow-hidden bg-slate-950">
        {cell.resolvedSource ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            playsInline
            onClick={(event) => {
              event.stopPropagation();
              togglePlayback();
            }}
            onPlay={() => onPlayChange(cell.id, true)}
            onPause={() => onPlayChange(cell.id, false)}
            onLoadedMetadata={(event) =>
              onTimeChange(
                cell.id,
                event.currentTarget.currentTime,
                Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null
              )
            }
            onTimeUpdate={(event) =>
              onTimeChange(
                cell.id,
                event.currentTarget.currentTime,
                Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null
              )
            }
            onError={() => onStatusChange(cell.id, 'error', 'Video element failed to load the source')}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#25314d,transparent_56%)] p-6 text-center text-slate-400">
            <div>
              <p className="text-lg font-medium text-white">{cell.label === 'Empty' ? 'Empty Slot' : cell.label}</p>
              <p className="mt-2 text-sm">Add a local video file to this cell.</p>
              <button
                type="button"
                data-testid={`video-cell-add-${cell.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddSource(cell.id);
                }}
                className="mt-5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-slate-900 transition hover:brightness-105"
              >
                + Add Video
              </button>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-300">
          <span className="max-w-[70%] truncate">{cell.label}</span>
          {cell.isLive ? (
            <span className="rounded-full border border-danger/80 bg-danger/20 px-2 py-1 text-[10px] tracking-[0.24em] text-rose-100">
              Live
            </span>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 pb-4 pt-10 text-sm text-slate-200">
          {statusText}
        </div>

        {dropActive ? (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[22px] border border-dashed border-accent bg-slate-950/75 text-sm font-medium text-white backdrop-blur-sm">
            Drop video here
          </div>
        ) : null}

        {compact && !isEmpty ? (
          <div
            data-testid={`video-cell-overlay-controls-${cell.id}`}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-12 opacity-0 transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <div className="pointer-events-auto grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlayChange(cell.id, !cell.playing);
                    }}
                    className="rounded-full border border-white/20 bg-black/45 px-3 py-2 text-sm text-white backdrop-blur transition hover:border-accent"
                  >
                    {cell.playing ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMutedChange(cell.id, !cell.muted);
                    }}
                    className="rounded-full border border-white/20 bg-black/45 px-3 py-2 text-sm text-white backdrop-blur transition hover:border-accent"
                  >
                    {cell.muted ? 'Unmute' : 'Mute'}
                  </button>
                  {showCompactLabels ? (
                    <span className="text-xs text-slate-200">
                      {formatTime(cell.currentTime)} {cell.duration ? `/ ${formatTime(cell.duration)}` : ''}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onChangeSource(cell.id);
                    }}
                    className="rounded-full border border-white/20 bg-black/45 px-3 py-2 text-sm text-slate-100 backdrop-blur transition hover:border-accent hover:text-white"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(cell.id);
                    }}
                    className="rounded-full border border-rose-300/40 bg-black/45 px-3 py-2 text-sm text-rose-100 backdrop-blur transition hover:bg-danger/20"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {!cell.isLive ? (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={cell.duration ?? 0}
                    step={0.1}
                    value={Math.min(cell.currentTime, cell.duration ?? cell.currentTime)}
                    onChange={(event) => {
                      event.stopPropagation();
                      const video = videoRef.current;
                      const nextTime = Number(event.target.value);
                      if (video) {
                        video.currentTime = nextTime;
                      }
                      onTimeChange(cell.id, nextTime, cell.duration);
                    }}
                    className="h-2 flex-1 cursor-pointer accent-accent"
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cell.volume}
                    onChange={(event) => {
                      event.stopPropagation();
                      onVolumeChange(cell.id, Number(event.target.value));
                    }}
                    aria-label={`Volume for ${cell.label}`}
                    className="h-2 w-24 cursor-pointer accent-accent"
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-success/60 bg-success/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-green-100">
                  Live stream
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {!compact && !isEmpty ? (
        <div className="grid gap-3 border-t border-border bg-panel px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPlayChange(cell.id, !cell.playing);
                }}
                className="rounded-full border border-border px-3 py-2 text-sm text-white transition hover:border-accent"
              >
                {cell.playing ? 'Pause' : 'Play'}
              </button>

              {showLabels ? (
                <span className="text-sm text-slate-300">
                  {formatTime(cell.currentTime)} {cell.duration ? `/ ${formatTime(cell.duration)}` : ''}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeSource(cell.id);
                }}
                className="rounded-full border border-border px-3 py-2 text-sm text-slate-200 transition hover:border-accent hover:text-white"
              >
                {showLabels ? 'Change Video' : 'Change'}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(cell.id);
                }}
                className="rounded-full border border-danger/60 px-3 py-2 text-sm text-rose-200 transition hover:bg-danger/10"
              >
                Remove
              </button>
            </div>
          </div>

          {!cell.isLive ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={cell.duration ?? 0}
                step={0.1}
                value={Math.min(cell.currentTime, cell.duration ?? cell.currentTime)}
                onChange={(event) => {
                  event.stopPropagation();
                  const video = videoRef.current;
                  const nextTime = Number(event.target.value);
                  if (video) {
                    video.currentTime = nextTime;
                  }
                  onTimeChange(cell.id, nextTime, cell.duration);
                }}
                className="h-2 flex-1 cursor-pointer accent-accent"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-success/60 bg-success/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-green-100">
              Live stream
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMutedChange(cell.id, !cell.muted);
              }}
              className="rounded-full border border-border px-3 py-2 text-sm text-white transition hover:border-accent"
            >
              {cell.muted ? 'Unmute' : 'Mute'}
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={cell.volume}
              onChange={(event) => {
                event.stopPropagation();
                onVolumeChange(cell.id, Number(event.target.value));
              }}
              className="h-2 w-full cursor-pointer accent-accent"
            />

            {showLabels ? <span className="min-w-10 text-right text-sm text-slate-300">{cell.volume}%</span> : null}
          </div>
        </div>
      ) : !compact ? (
        <div className="border-t border-border bg-panel px-4 py-3 text-sm text-slate-400">
          This grid slot is empty.
        </div>
      ) : null}

      {compact && isEmpty ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/20 px-4 py-2 text-xs text-slate-300 backdrop-blur-sm">
          Local file slot
        </div>
      ) : null}

      <div
        className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize opacity-0 transition group-hover:opacity-100"
        onMouseDown={(event) => beginResize(event, 'width')}
      />
      <div
        className="absolute inset-x-0 bottom-0 z-20 h-3 cursor-ns-resize opacity-0 transition group-hover:opacity-100"
        onMouseDown={(event) => beginResize(event, 'height')}
      />
      <div
        className="absolute bottom-0 right-0 z-30 h-5 w-5 cursor-nwse-resize opacity-0 transition group-hover:opacity-100"
        onMouseDown={(event) => beginResize(event, 'both')}
      />
    </div>
  );
}
