export type SourceType = 'local' | 'hls' | 'dash' | 'rtsp';

export interface Cell {
  id: string;
  source: string | null;
  sourceType: SourceType | null;
  resolvedSource: string | null;
  label: string;
  playing: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number | null;
  isLive: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

export interface PresetCell {
  index: number;
  label: string;
  source: string | null;
  sourceType?: SourceType | null;
}

export interface Preset {
  id: string;
  name: string;
  columns: number;
  rows: number;
  cells: PresetCell[];
  createdAt: string;
}

export interface GridSession {
  cells: Cell[];
  presets: Preset[];
  recentSources: string[];
}

export interface ResolvedSource {
  sourceType: SourceType;
  originalSource: string;
  playbackUrl: string;
  isLive: boolean;
}

export interface SourceValidationResult {
  ok: boolean;
  message?: string;
  sourceType?: SourceType;
  isLive?: boolean;
}

export interface ScreenshotPayload {
  cellId: string;
  dataUrl: string;
}

export interface StorageApi {
  loadSession: () => Promise<GridSession | null>;
  saveSession: (session: GridSession) => Promise<void>;
  selectLocalVideo: () => Promise<string | null>;
  validateSource: (value: string, local: boolean) => Promise<SourceValidationResult>;
  resolveSource: (cellId: string, value: string, sourceType: SourceType) => Promise<ResolvedSource>;
  stopRtspBridge: (cellId: string) => Promise<void>;
  exportPreset: (preset: Preset) => Promise<boolean>;
  importPreset: () => Promise<Preset | null>;
  saveScreenshots: (shots: ScreenshotPayload[]) => Promise<string[]>;
}
