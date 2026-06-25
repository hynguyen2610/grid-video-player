import { useEffect, useMemo, useState } from 'react';
import type { FolderVideoSelection } from '../shared/types';

interface ThumbnailState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  thumbnailUrl: string | null;
}

interface ThumbnailCacheEntry extends ThumbnailState {
  promise: Promise<string | null> | null;
  listeners: Set<(state: ThumbnailState) => void>;
}

const thumbnailCache = new Map<string, ThumbnailCacheEntry>();

interface VideoLibrarySidebarProps {
  open: boolean;
  videos: FolderVideoSelection[];
  activeCounts: Record<string, number>;
  onToggle: () => void;
  onPickFolder: () => void;
  onThumbnailStateChange: (
    sourceKey: string,
    nextState: { thumbnailSource?: string; thumbnailProgress?: number }
  ) => void;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getCacheKey(item: FolderVideoSelection): string {
  return item.sourceKey ?? item.source;
}

function getOrCreateEntry(item: FolderVideoSelection): ThumbnailCacheEntry {
  const cacheKey = getCacheKey(item);
  const existing = thumbnailCache.get(cacheKey);
  if (existing) {
    if (item.thumbnailSource && !existing.thumbnailUrl) {
      existing.thumbnailUrl = item.thumbnailSource;
      existing.progress = 100;
      existing.status = 'ready';
    } else if (item.thumbnailProgress && existing.progress < item.thumbnailProgress) {
      existing.progress = clampProgress(item.thumbnailProgress);
      if (existing.status === 'idle') {
        existing.status = 'loading';
      }
    }
    return existing;
  }

  const next: ThumbnailCacheEntry = {
    status: item.thumbnailSource ? 'ready' : item.thumbnailProgress ? 'loading' : 'idle',
    progress: item.thumbnailSource ? 100 : clampProgress(item.thumbnailProgress ?? 0),
    thumbnailUrl: item.thumbnailSource ?? null,
    promise: null,
    listeners: new Set()
  };
  thumbnailCache.set(cacheKey, next);
  return next;
}

function emitThumbnailState(cacheKey: string) {
  const entry = thumbnailCache.get(cacheKey);
  if (!entry) {
    return;
  }

  const snapshot: ThumbnailState = {
    status: entry.status,
    progress: entry.progress,
    thumbnailUrl: entry.thumbnailUrl
  };
  entry.listeners.forEach((listener) => listener(snapshot));
}

function updateEntry(cacheKey: string, patch: Partial<ThumbnailState>) {
  const entry = thumbnailCache.get(cacheKey);
  if (!entry) {
    return;
  }

  if (patch.status) {
    entry.status = patch.status;
  }
  if (typeof patch.progress === 'number') {
    entry.progress = clampProgress(patch.progress);
  }
  if (patch.thumbnailUrl !== undefined) {
    entry.thumbnailUrl = patch.thumbnailUrl;
  }
  emitThumbnailState(cacheKey);
}

function subscribeToThumbnail(
  item: FolderVideoSelection,
  listener: (state: ThumbnailState) => void
) {
  const cacheKey = getCacheKey(item);
  const entry = getOrCreateEntry(item);
  entry.listeners.add(listener);
  listener({
    status: entry.status,
    progress: entry.progress,
    thumbnailUrl: entry.thumbnailUrl
  });

  return () => {
    entry.listeners.delete(listener);
  };
}

function ensureThumbnailLoading(item: FolderVideoSelection) {
  const cacheKey = getCacheKey(item);
  const entry = getOrCreateEntry(item);

  if (entry.thumbnailUrl || entry.promise) {
    return;
  }

  updateEntry(cacheKey, {
    status: 'loading',
    progress: Math.max(entry.progress, 8)
  });

  const video = document.createElement('video');
  video.src = item.source;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  let captured = false;
  let targetFrameRequested = false;
  let awaitingFallbackSeek = false;

  const cleanup = () => {
    video.src = '';
  };

  entry.promise = new Promise<string | null>((resolve) => {
    const finalize = (value: string | null) => {
      if (value) {
        updateEntry(cacheKey, {
          status: 'ready',
          progress: 100,
          thumbnailUrl: value
        });
      } else {
        updateEntry(cacheKey, {
          status: 'error',
          progress: entry.progress
        });
      }
      const current = thumbnailCache.get(cacheKey);
      if (current) {
        current.promise = null;
      }
      cleanup();
      resolve(value);
    };

    const captureFrame = () => {
      if (captured || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d');
      if (!context) {
        finalize(null);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      captured = true;
      finalize(canvas.toDataURL('image/png'));
    };

    const seekToApproximateTenthFrame = () => {
      const frameTime = 10 / 30;
      const duration = Number.isFinite(video.duration) ? video.duration : frameTime;
      const targetTime = Math.min(frameTime, Math.max(0, duration));
      if (Math.abs(video.currentTime - targetTime) > 0.001) {
        awaitingFallbackSeek = true;
        video.currentTime = targetTime;
        return true;
      }
      return false;
    };

    const requestTenthFrame = () => {
      if (typeof video.requestVideoFrameCallback !== 'function') {
        return false;
      }

      targetFrameRequested = true;
      let frameCount = 0;
      const step = () => {
        frameCount += 1;
        updateEntry(cacheKey, {
          status: 'loading',
          progress: Math.max((thumbnailCache.get(cacheKey)?.progress ?? 0), Math.min(92, 35 + frameCount * 5))
        });

        if (frameCount >= 10) {
          video.pause();
          captureFrame();
          return;
        }

        video.requestVideoFrameCallback(step);
      };

      video
        .play()
        .then(() => {
          video.requestVideoFrameCallback(step);
        })
        .catch(() => {
          seekToApproximateTenthFrame();
        });
      return true;
    };

    const handleLoadedMetadata = () => {
      updateEntry(cacheKey, {
        status: 'loading',
        progress: Math.max((thumbnailCache.get(cacheKey)?.progress ?? 0), 35)
      });

      if (requestTenthFrame()) {
        return;
      }

      if (seekToApproximateTenthFrame()) {
        return;
      }

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        captureFrame();
      }
    };

    const handleLoadedData = () => {
      updateEntry(cacheKey, {
        status: 'loading',
        progress: Math.max((thumbnailCache.get(cacheKey)?.progress ?? 0), 72)
      });

      if (targetFrameRequested || awaitingFallbackSeek) {
        return;
      }
      captureFrame();
    };

    const handleSeeked = () => {
      updateEntry(cacheKey, {
        status: 'loading',
        progress: Math.max((thumbnailCache.get(cacheKey)?.progress ?? 0), 88)
      });
      awaitingFallbackSeek = false;
      captureFrame();
    };

    const handleError = () => finalize(null);

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError, { once: true });
    video.load();
  });
}

function useThumbnailState(item: FolderVideoSelection) {
  const [state, setState] = useState<ThumbnailState>(() => {
    const entry = getOrCreateEntry(item);
    return {
      status: entry.status,
      progress: entry.progress,
      thumbnailUrl: entry.thumbnailUrl
    };
  });

  useEffect(() => subscribeToThumbnail(item, setState), [item]);

  useEffect(() => {
    if (!state.thumbnailUrl) {
      ensureThumbnailLoading(item);
    }
  }, [item, state.thumbnailUrl]);

  return state;
}

function VideoThumbnailCard({
  item,
  activeCount,
  onThumbnailStateChange
}: {
  item: FolderVideoSelection;
  activeCount: number;
  onThumbnailStateChange: (
    sourceKey: string,
    nextState: { thumbnailSource?: string; thumbnailProgress?: number }
  ) => void;
}) {
  const cacheKey = getCacheKey(item);
  const thumbnailState = useThumbnailState(item);

  useEffect(() => {
    onThumbnailStateChange(cacheKey, {
      thumbnailSource: thumbnailState.thumbnailUrl ?? undefined,
      thumbnailProgress: thumbnailState.progress
    });
  }, [cacheKey, onThumbnailStateChange, thumbnailState.progress, thumbnailState.thumbnailUrl]);

  const loadingFrameStyle = useMemo(() => {
    if (thumbnailState.status !== 'loading') {
      return undefined;
    }

    return {
      background: `conic-gradient(from 0deg, rgba(142, 247, 187, 0.95) 0deg ${
        (thumbnailState.progress / 100) * 360
      }deg, rgba(66, 78, 99, 0.4) ${(thumbnailState.progress / 100) * 360}deg 360deg)`
    };
  }, [thumbnailState.progress, thumbnailState.status]);

  return (
    <div
      draggable
      data-testid={`sidebar-video-${item.label}`}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-grid-video', JSON.stringify(item));
        event.dataTransfer.effectAllowed = 'copy';
      }}
      className="group cursor-grab overflow-hidden rounded-[22px] border border-border bg-card transition hover:border-accent active:cursor-grabbing"
    >
      <div
        className={`relative aspect-video overflow-hidden bg-slate-950 ${
          thumbnailState.status === 'loading' ? 'p-[3px]' : ''
        }`}
        style={loadingFrameStyle}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-slate-950">
          {thumbnailState.thumbnailUrl ? (
            <img src={thumbnailState.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#25314d,transparent_56%)] text-xs uppercase tracking-[0.25em] text-slate-300">
              {thumbnailState.status === 'loading'
                ? `Loading ${thumbnailState.progress}%`
                : 'Video'}
            </div>
          )}

          {activeCount > 0 ? (
            <div className="absolute right-2 top-2 rounded-full bg-accent px-2 py-1 text-xs font-semibold text-slate-950">
              {activeCount}
            </div>
          ) : null}

          {thumbnailState.status === 'loading' ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-accentSoft">
              Thumbnail {thumbnailState.progress}%
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{item.label}</p>
          <p className="text-xs text-slate-400">
            {thumbnailState.status === 'loading' ? 'Preparing preview' : 'Drag to play'}
          </p>
        </div>
        <div className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
          Local
        </div>
      </div>
    </div>
  );
}

export function VideoLibrarySidebar({
  open,
  videos,
  activeCounts,
  onToggle,
  onPickFolder,
  onThumbnailStateChange
}: VideoLibrarySidebarProps) {
  return (
    <aside
      className={`border-r border-border/70 bg-canvas/85 backdrop-blur transition-all duration-200 ${
        open ? 'w-80' : 'w-14'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-border bg-card px-3 py-2 text-sm text-slate-200 transition hover:border-accent hover:text-white"
          >
            {open ? 'Hide' : 'Show'}
          </button>
          {open ? (
            <button
              type="button"
              onClick={onPickFolder}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-slate-900 transition hover:brightness-105"
            >
              Pick Folder
            </button>
          ) : null}
        </div>

        {open ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.3em] text-accentSoft">Library</p>
              <p className="mt-1 text-sm text-slate-400">
                Drag any video into a cell. The badge shows how many live sessions are using it.
              </p>
            </div>

            {videos.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border bg-card/60 p-5 text-sm text-slate-400">
                Pick a local folder to build the video library.
              </div>
            ) : (
              <div className="grid gap-3">
                {videos.map((item) => (
                  <VideoThumbnailCard
                    key={getCacheKey(item)}
                    item={item}
                    activeCount={activeCounts[getCacheKey(item)] ?? 0}
                    onThumbnailStateChange={onThumbnailStateChange}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-start justify-center px-2 py-4">
            <div className="-rotate-90 whitespace-nowrap text-xs uppercase tracking-[0.3em] text-slate-500">
              Library
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
