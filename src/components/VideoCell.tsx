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
  onAddSource: (id: string) => void;
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
  onAddSource,
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  return (
    <div
      ref={setContainer}
      data-testid={`video-cell-${cell.id}`}
      className="group flex min-h-[220px] flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_20px_80px_rgba(0,0,0,0.28)]"
    >
      <div className="relative flex-1 overflow-hidden bg-slate-950">
        {cell.resolvedSource ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            playsInline
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
                onClick={() => onAddSource(cell.id)}
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
      </div>

      {!isEmpty ? (
        <div className="grid gap-3 border-t border-border bg-panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPlayChange(cell.id, !cell.playing)}
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
              onClick={() => onChangeSource(cell.id)}
              className="rounded-full border border-border px-3 py-2 text-sm text-slate-200 transition hover:border-accent hover:text-white"
            >
              {showLabels ? 'Change Video' : 'Change'}
            </button>
            <button
              type="button"
              onClick={() => onRemove(cell.id)}
              className="rounded-full border border-danger/60 px-3 py-2 text-sm text-rose-200 transition hover:bg-danger/10"
            >
              Remove
            </button>
          </div>
        </div>

        {!cell.isLive ? (
          <div className="flex items-center gap-3">
            {!compact ? (
              <input
                type="range"
                min={0}
                max={cell.duration ?? 0}
                step={0.1}
                value={Math.min(cell.currentTime, cell.duration ?? cell.currentTime)}
                onChange={(event) => {
                  const video = videoRef.current;
                  const nextTime = Number(event.target.value);
                  if (video) {
                    video.currentTime = nextTime;
                  }
                  onTimeChange(cell.id, nextTime, cell.duration);
                }}
                className="h-2 flex-1 cursor-pointer accent-accent"
              />
            ) : (
              <div className="rounded-full border border-border px-3 py-2 text-xs text-slate-300">Seek</div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-success/60 bg-success/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-green-100">
            Live stream
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onMutedChange(cell.id, !cell.muted)}
            className="rounded-full border border-border px-3 py-2 text-sm text-white transition hover:border-accent"
          >
            {cell.muted ? 'Unmute' : 'Mute'}
          </button>

          {!compact ? (
            <input
              type="range"
              min={0}
              max={100}
              value={cell.volume}
              onChange={(event) => onVolumeChange(cell.id, Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-accent"
            />
          ) : (
            <div className="rounded-full border border-border px-3 py-2 text-xs text-slate-300">Vol {cell.volume}%</div>
          )}

          {showLabels ? <span className="min-w-10 text-right text-sm text-slate-300">{cell.volume}%</span> : null}
        </div>
      </div>
      ) : (
        <div className="border-t border-border bg-panel px-4 py-3 text-sm text-slate-400">
          This grid slot is empty.
        </div>
      )}
    </div>
  );
}
