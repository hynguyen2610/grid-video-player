import { contextBridge, ipcRenderer } from 'electron';
import type {
  GridVideoTestApi,
  GridSession,
  LocalVideoSelection,
  Preset,
  ScreenshotPayload,
  SourceType,
  StorageApi
} from '../src/shared/types';

const isTestMode = process.env.GRID_VIDEO_TEST_MODE === '1';

const api: StorageApi = {
  loadSession: () => ipcRenderer.invoke('storage:load-session') as Promise<GridSession | null>,
  saveSession: (session) => ipcRenderer.invoke('storage:save-session', session) as Promise<void>,
  selectLocalVideo: () => ipcRenderer.invoke('dialog:select-local-video') as Promise<LocalVideoSelection | null>,
  selectVideoFolder: () => ipcRenderer.invoke('dialog:select-video-folder'),
  validateSource: (value, local) =>
    ipcRenderer.invoke('source:validate', value, local),
  resolveSource: (cellId, value, sourceType) =>
    ipcRenderer.invoke('source:resolve', {
      cellId,
      value,
      sourceType
    }),
  stopRtspBridge: (cellId) => ipcRenderer.invoke('source:stop-rtsp', cellId) as Promise<void>,
  exportPreset: (preset: Preset) => ipcRenderer.invoke('preset:export', preset) as Promise<boolean>,
  importPreset: () => ipcRenderer.invoke('preset:import') as Promise<Preset | null>,
  saveScreenshots: (shots: ScreenshotPayload[]) =>
    ipcRenderer.invoke('screenshots:save', shots) as Promise<string[]>
};

contextBridge.exposeInMainWorld('gridVideo', api);

if (isTestMode) {
  let promptResponse: string | null = null;

  const testApi: GridVideoTestApi = {
    resetSession: () => ipcRenderer.invoke('test:reset-session') as Promise<void>,
    seedSession: (session) => ipcRenderer.invoke('test:seed-session', session) as Promise<void>,
    getSession: () => ipcRenderer.invoke('test:get-session') as Promise<GridSession | null>,
    setSelectedLocalVideo: (value) =>
      ipcRenderer.invoke('test:set-selected-local-video', value) as Promise<void>,
    setImportedPreset: (preset) =>
      ipcRenderer.invoke('test:set-imported-preset', preset) as Promise<void>,
    setPromptResponse: (value) => {
      promptResponse = value;
    }
  };

  contextBridge.exposeInMainWorld('gridVideoTest', testApi);

  const installMediaMocks = () => {
    const srcValues = new WeakMap<HTMLMediaElement, string>();
    const currentTimeValues = new WeakMap<HTMLMediaElement, number>();
    const mutedValues = new WeakMap<HTMLMediaElement, boolean>();
    const volumeValues = new WeakMap<HTMLMediaElement, number>();
    const pausedValues = new WeakMap<HTMLMediaElement, boolean>();

    const define = (
      target: object,
      key: string,
      descriptor: PropertyDescriptor
    ) => {
      Object.defineProperty(target, key, descriptor);
    };

    define(window, 'prompt', {
      configurable: true,
      value: () => promptResponse
    });

    define(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return srcValues.get(this) ?? '';
      },
      set(this: HTMLMediaElement, value: string) {
        srcValues.set(this, value);
        queueMicrotask(() => {
          this.dispatchEvent(new Event('loadedmetadata'));
          this.dispatchEvent(new Event('canplay'));
          this.dispatchEvent(new Event('timeupdate'));
        });
      }
    });

    define(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return currentTimeValues.get(this) ?? 0;
      },
      set(this: HTMLMediaElement, value: number) {
        currentTimeValues.set(this, value);
        this.dispatchEvent(new Event('timeupdate'));
      }
    });

    define(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return 120;
      }
    });

    define(HTMLMediaElement.prototype, 'muted', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return mutedValues.get(this) ?? false;
      },
      set(this: HTMLMediaElement, value: boolean) {
        mutedValues.set(this, value);
      }
    });

    define(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return volumeValues.get(this) ?? 0.8;
      },
      set(this: HTMLMediaElement, value: number) {
        volumeValues.set(this, value);
      }
    });

    define(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return pausedValues.get(this) ?? true;
      }
    });

    define(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get(this: HTMLVideoElement) {
        return 1280;
      }
    });

    define(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get(this: HTMLVideoElement) {
        return 720;
      }
    });

    HTMLMediaElement.prototype.play = function () {
      pausedValues.set(this, false);
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };

    HTMLMediaElement.prototype.pause = function () {
      pausedValues.set(this, true);
      this.dispatchEvent(new Event('pause'));
    };

    HTMLMediaElement.prototype.load = function () {};
  };

  window.addEventListener('DOMContentLoaded', installMediaMocks, { once: true });
}
