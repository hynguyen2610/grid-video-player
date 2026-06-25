import type {
  Cell,
  FolderVideoSelection,
  GridSession,
  LocalVideoSelection,
  Preset,
  ResolvedSource,
  ScreenshotPayload,
  SourceValidationResult,
  StorageApi
} from '../shared/types';
import { inferSourceType } from '../utils/source';

const SESSION_STORAGE_KEY = 'grid-video:web-session';
const HANDLE_DB_NAME = 'grid-video-handles';
const HANDLE_STORE_NAME = 'file-handles';

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

interface PersistedGridSession extends Omit<GridSession, 'libraryVideos'> {
  libraryVideos?: Array<
    Pick<FolderVideoSelection, 'label' | 'sourceKey' | 'thumbnailSource' | 'thumbnailProgress'>
  >;
}

function parsePersistedSession(raw: string | null): PersistedGridSession | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedGridSession;
  } catch {
    return null;
  }
}

function cloneSession(session: GridSession): PersistedGridSession {
  return {
    gridColumns: session.gridColumns,
    gridRows: session.gridRows,
    layoutMode: session.layoutMode,
    compactMode: session.compactMode,
    sidebarOpen: session.sidebarOpen,
    cells: session.cells.map((cell) => ({ ...cell })),
    libraryVideos: (session.libraryVideos ?? []).map((video) => ({
      label: video.label,
      sourceKey: video.sourceKey ?? video.source,
      thumbnailSource: video.thumbnailSource,
      thumbnailProgress: video.thumbnailProgress
    })),
    presets: session.presets.map((preset) => ({
      ...preset,
      cells: preset.cells.map((cell) => ({ ...cell }))
    })),
    recentSources: [...session.recentSources]
  };
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(key: string, handle: FileSystemFileHandle) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    tx.objectStore(HANDLE_STORE_NAME).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadHandle(key: string): Promise<FileSystemFileHandle | null> {
  const db = await openHandleDb();
  const result = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = tx.objectStore(HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function restoreLocalVideo(key: string): Promise<{ source: string; label: string } | null> {
  const handle = await loadHandle(key);
  if (!handle) {
    return null;
  }

  try {
    const file = await handle.getFile();
    return {
      source: URL.createObjectURL(file),
      label: file.name.replace(/\.[^.]+$/, '') || 'Local Video'
    };
  } catch {
    return null;
  }
}

async function sanitizeRestoredCell(cell: Cell): Promise<Cell> {
  if (cell.sourceType !== 'local') {
    return { ...cell };
  }

  if (cell.sourceKey) {
    const restored = await restoreLocalVideo(cell.sourceKey);
    if (restored) {
      return {
        ...cell,
        source: restored.source,
        resolvedSource: restored.source,
        label: cell.label || restored.label,
        status: 'ready'
      };
    }
  }

  if (cell.source?.startsWith('blob:')) {
    return {
      ...cell,
      source: null,
      resolvedSource: null,
      currentTime: 0,
      duration: null,
      playing: false,
      status: 'idle',
      error: null
    };
  }

  return { ...cell };
}

async function restoreLibraryVideos(
  videos: PersistedGridSession['libraryVideos']
): Promise<FolderVideoSelection[]> {
  const restored: Array<FolderVideoSelection | null> = await Promise.all(
    (videos ?? []).map(async (video) => {
      if (!video.sourceKey) {
        return null;
      }

      const localVideo = await restoreLocalVideo(video.sourceKey);
      if (!localVideo) {
        return null;
      }

      return {
        source: localVideo.source,
        label: video.label || localVideo.label,
        sourceKey: video.sourceKey,
        thumbnailSource: video.thumbnailSource,
        thumbnailProgress: video.thumbnailProgress
      } satisfies FolderVideoSelection;
    })
  );

  return restored.filter((video): video is FolderVideoSelection => video !== null);
}

async function restoreSession(raw: string | null): Promise<GridSession | null> {
  const parsed = parsePersistedSession(raw);
  if (!parsed) {
    return null;
  }

  try {
    return {
      gridColumns: parsed.gridColumns,
      gridRows: parsed.gridRows,
      layoutMode: parsed.layoutMode,
      compactMode: parsed.compactMode,
      sidebarOpen: parsed.sidebarOpen,
      cells: await Promise.all(parsed.cells.map(sanitizeRestoredCell)),
      libraryVideos: await restoreLibraryVideos(parsed.libraryVideos),
      presets: parsed.presets ?? [],
      recentSources: parsed.recentSources ?? []
    };
  } catch {
    return null;
  }
}

export function peekStoredSidebarOpen(): boolean {
  const parsed = parsePersistedSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
  return parsed?.sidebarOpen ?? true;
}

function persistSession(session: GridSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cloneSession(session)));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function pickFile(options: { accept: string; multiple?: boolean }): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple ?? false;
    input.onchange = () => resolve(input.files);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function pickLocalVideoFile(): Promise<File | null> {
  const pickerWindow = window as FilePickerWindow;

  if (pickerWindow.showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: 'Video Files',
            accept: {
              'video/mp4': ['.mp4'],
              'video/webm': ['.webm'],
              'video/quicktime': ['.mov'],
              'video/x-matroska': ['.mkv'],
              'video/x-msvideo': ['.avi']
            }
          }
        ]
      });

      return (await handle?.getFile()) ?? null;
    } catch {
      return null;
    }
  }

  const files = await pickFile({
    accept: '.mp4,.mkv,.mov,.avi,.webm,video/mp4,video/webm,video/quicktime,video/x-matroska'
  });

  return files?.[0] ?? null;
}

async function pickLocalVideoSelection(): Promise<LocalVideoSelection | null> {
  const pickerWindow = window as FilePickerWindow;

  if (pickerWindow.showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: true,
        types: [
          {
            description: 'Video Files',
            accept: {
              'video/mp4': ['.mp4'],
              'video/webm': ['.webm'],
              'video/quicktime': ['.mov'],
              'video/x-matroska': ['.mkv'],
              'video/x-msvideo': ['.avi']
            }
          }
        ]
      });

      const file = await handle?.getFile();
      if (!file) {
        return null;
      }

      const sourceKey = `local:${file.name}:${file.size}:${file.lastModified}`;
      await saveHandle(sourceKey, handle);
      return {
        source: URL.createObjectURL(file),
        label: file.name.replace(/\.[^.]+$/, '') || 'Local Video',
        sourceKey
      };
    } catch {
      return null;
    }
  }

  const file = await pickLocalVideoFile();
  if (!file) {
    return null;
  }

  return {
    source: URL.createObjectURL(file),
    label: file.name.replace(/\.[^.]+$/, '') || 'Local Video',
    sourceKey: `local:${file.name}:${file.size}:${file.lastModified}`
  };
}

function isVideoFile(file: File): boolean {
  return (
    file.type.startsWith('video/') ||
    /\.(mp4|mkv|mov|avi|webm|m4v)$/i.test(file.name)
  );
}

async function pickVideoFolderFiles(): Promise<FolderVideoSelection[]> {
  const pickerWindow = window as FilePickerWindow;

  if (pickerWindow.showDirectoryPicker) {
    try {
      const handle = await pickerWindow.showDirectoryPicker();
      const files: FolderVideoSelection[] = [];

      for await (const entry of (handle as FileSystemDirectoryHandle & {
        values: () => AsyncIterable<FileSystemHandle>;
      }).values()) {
        if (entry.kind !== 'file') {
          continue;
        }

        const file = await (entry as FileSystemFileHandle).getFile();
        if (isVideoFile(file)) {
          const sourceKey = `local:${file.name}:${file.size}:${file.lastModified}`;
          await saveHandle(sourceKey, entry as FileSystemFileHandle);
          files.push({
            source: URL.createObjectURL(file),
            label: file.name.replace(/\.[^.]+$/, '') || 'Local Video',
            sourceKey,
            thumbnailProgress: 0
          });
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.multiple = true;
    input.accept = '.mp4,.mkv,.mov,.avi,.webm,.m4v,video/*';
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
        .filter(isVideoFile)
        .map(
          (file) =>
            ({
              source: URL.createObjectURL(file),
              label: file.name.replace(/\.[^.]+$/, '') || 'Local Video',
              sourceKey: `local:${file.name}:${file.size}:${file.lastModified}`,
              thumbnailProgress: 0
            }) satisfies FolderVideoSelection
        );
      resolve(files);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function getLabelFromSource(source: string): string {
  if (source.startsWith('blob:')) {
    return 'Local Video';
  }

  const parts = source.split(/[\\/]/);
  const filename = parts[parts.length - 1] ?? 'video';
  return filename.replace(/\.[^.]+$/, '') || 'Local Video';
}

export const browserGridVideoApi: StorageApi = {
  async loadSession() {
    return restoreSession(window.localStorage.getItem(SESSION_STORAGE_KEY));
  },
  async saveSession(session) {
    persistSession(session);
  },
  async selectLocalVideo() {
    return pickLocalVideoSelection();
  },
  async selectVideoFolder() {
    return pickVideoFolderFiles();
  },
  async validateSource(value, local) {
    if (!value.trim()) {
      return { ok: false, message: 'Source is required.' };
    }

    const sourceType = inferSourceType(value);

    if (local) {
      if (value.startsWith('blob:')) {
        return { ok: true, sourceType: 'local', isLive: false };
      }

      if (sourceType !== 'local') {
        return {
          ok: false,
          message: 'Supported local files: MP4, MKV, MOV, AVI, WebM.'
        };
      }

      return { ok: true, sourceType: 'local', isLive: false };
    }

    if (!sourceType) {
      return {
        ok: false,
        message: 'Supported stream inputs are HLS (.m3u8), DASH (.mpd), or RTSP.'
      };
    }

    if (sourceType === 'rtsp') {
      return {
        ok: false,
        message: 'RTSP requires the Electron desktop bridge. Use HLS or DASH in the web app.'
      };
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      const response = await fetch(value, { method: 'HEAD', signal: controller.signal });
      window.clearTimeout(timeout);

      if (!response.ok) {
        return { ok: false, message: `Source returned HTTP ${response.status}.` };
      }

      return { ok: true, sourceType, isLive: true };
    } catch {
      return {
        ok: false,
        message: 'Unable to validate the stream URL from the browser. Check the URL or CORS policy.'
      };
    }
  },
  async resolveSource(_cellId, value, sourceType): Promise<ResolvedSource> {
    if (sourceType === 'rtsp') {
      throw new Error('RTSP is only supported in the Electron desktop build.');
    }

    return {
      sourceType,
      originalSource: value,
      playbackUrl: value,
      isLive: sourceType !== 'local'
    };
  },
  async stopRtspBridge() {
    return;
  },
  async exportPreset(preset: Preset) {
    downloadBlob(
      new Blob([`${JSON.stringify(preset, null, 2)}\n`], { type: 'application/json' }),
      `${preset.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'preset'}.json`
    );
    return true;
  },
  async importPreset() {
    const files = await pickFile({ accept: '.json,application/json' });
    const file = files?.[0];
    if (!file) {
      return null;
    }

    try {
      const raw = await file.text();
      return JSON.parse(raw) as Preset;
    } catch {
      return null;
    }
  },
  async saveScreenshots(shots: ScreenshotPayload[]) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filenames = shots.map((shot, index) => `${stamp}-${index + 1}-${shot.cellId}.png`);

    shots.forEach((shot, index) => {
      const response = fetch(shot.dataUrl).then((result) => result.blob());
      void response.then((blob) => downloadBlob(blob, filenames[index]));
    });

    return filenames;
  }
};

export function getGridVideoApi(): StorageApi {
  return window.gridVideo ?? browserGridVideoApi;
}

export function installGridVideoApi() {
  if (!window.gridVideo) {
    window.gridVideo = browserGridVideoApi;
  }
}
