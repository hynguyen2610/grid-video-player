import { contextBridge, ipcRenderer } from 'electron';
import type {
  GridSession,
  Preset,
  ScreenshotPayload,
  SourceType,
  StorageApi
} from '../src/shared/types';

const api: StorageApi = {
  loadSession: () => ipcRenderer.invoke('storage:load-session') as Promise<GridSession | null>,
  saveSession: (session) => ipcRenderer.invoke('storage:save-session', session) as Promise<void>,
  selectLocalVideo: () => ipcRenderer.invoke('dialog:select-local-video') as Promise<string | null>,
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
