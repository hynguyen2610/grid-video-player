import { useEffect, useState } from 'react';
import type { FolderVideoSelection } from '../shared/types';

interface VideoLibrarySidebarProps {
  open: boolean;
  videos: FolderVideoSelection[];
  activeCounts: Record<string, number>;
  onToggle: () => void;
  onPickFolder: () => void;
}

function VideoThumbnail({ item }: { item: FolderVideoSelection }) {
  const [thumbnailUrl, setThumbnailUrl] = useState(item.thumbnailSource ?? '');

  useEffect(() => {
    if (item.thumbnailSource) {
      setThumbnailUrl(item.thumbnailSource);
      return;
    }

    let revokedUrl: string | null = null;
    const video = document.createElement('video');
    video.src = item.source;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const handleLoadedData = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      revokedUrl = canvas.toDataURL('image/png');
      setThumbnailUrl(revokedUrl);
    };

    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.src = '';
    };
  }, [item.source, item.thumbnailSource]);

  if (thumbnailUrl) {
    return <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#25314d,transparent_56%)] text-xs uppercase tracking-[0.25em] text-slate-300">
      Video
    </div>
  );
}

export function VideoLibrarySidebar({
  open,
  videos,
  activeCounts,
  onToggle,
  onPickFolder
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
                {videos.map((item) => {
                  const activeCount = activeCounts[item.sourceKey ?? item.source] ?? 0;
                  return (
                    <div
                      key={item.sourceKey ?? item.source}
                      draggable
                      data-testid={`sidebar-video-${item.label}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-grid-video', JSON.stringify(item));
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="group cursor-grab overflow-hidden rounded-[22px] border border-border bg-card transition hover:border-accent active:cursor-grabbing"
                    >
                      <div className="relative aspect-video overflow-hidden bg-slate-950">
                        <VideoThumbnail item={item} />
                        {activeCount > 0 ? (
                          <div className="absolute right-2 top-2 rounded-full bg-accent px-2 py-1 text-xs font-semibold text-slate-950">
                            {activeCount}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{item.label}</p>
                          <p className="text-xs text-slate-400">Drag to play</p>
                        </div>
                        <div className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          Local
                        </div>
                      </div>
                    </div>
                  );
                })}
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
