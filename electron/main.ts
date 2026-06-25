import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import type {
  GridSession,
  LocalVideoSelection,
  Preset,
  ResolvedSource,
  ScreenshotPayload,
  SourceType,
  SourceValidationResult
} from '../src/shared/types';

const isTestMode = process.env.GRID_VIDEO_TEST_MODE === '1';
if (isTestMode) {
  const userDataDir =
    process.env.GRID_VIDEO_USER_DATA_DIR ??
    path.join(os.tmpdir(), `grid-video-playwright-${process.pid}`);
  app.setPath('userData', userDataDir);
}

const DEFAULT_SESSION: GridSession = {
  cells: [],
  presets: [],
  recentSources: []
};

const sessionFilePath = path.join(app.getPath('userData'), 'session.json');

function readSession(): GridSession {
  try {
    if (!fs.existsSync(sessionFilePath)) {
      return DEFAULT_SESSION;
    }

    const raw = fs.readFileSync(sessionFilePath, 'utf8');
    return {
      ...DEFAULT_SESSION,
      ...(JSON.parse(raw) as GridSession)
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

function writeSession(session: GridSession): void {
  fs.mkdirSync(path.dirname(sessionFilePath), { recursive: true });
  fs.writeFileSync(sessionFilePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

class MediaServer {
  private server: http.Server | null = null;

  private port = 0;

  constructor(private readonly rtspSessions: Map<string, RtspSession>) {}

  async ensureStarted(): Promise<number> {
    if (this.server && this.port) {
      return this.port;
    }

    this.server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (requestUrl.pathname.startsWith('/local/')) {
        const encodedPath = requestUrl.pathname.replace('/local/', '');
        const filePath = decodeURIComponent(encodedPath);

        if (!fs.existsSync(filePath)) {
          res.writeHead(404).end('File not found');
          return;
        }

        fs.createReadStream(filePath)
          .on('error', () => res.writeHead(500).end('Failed to read file'))
          .pipe(res);
        return;
      }

      if (requestUrl.pathname.startsWith('/rtsp/')) {
        const parts = requestUrl.pathname.split('/');
        const cellId = parts[2];
        const filename = parts[3];
        const session = this.rtspSessions.get(cellId);

        if (!session) {
          res.writeHead(404).end('RTSP bridge not found');
          return;
        }

        const filePath = path.join(session.outputDir, filename);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404).end('Segment not ready');
          return;
        }

        fs.createReadStream(filePath)
          .on('error', () => res.writeHead(500).end('Failed to read segment'))
          .pipe(res);
        return;
      }

      res.writeHead(404).end('Not found');
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
        }
        resolve();
      });
    });

    return this.port;
  }

  async localFileUrl(filePath: string): Promise<string> {
    const port = await this.ensureStarted();
    return `http://127.0.0.1:${port}/local/${encodeURIComponent(filePath)}`;
  }

  async rtspUrl(cellId: string): Promise<string> {
    const port = await this.ensureStarted();
    return `http://127.0.0.1:${port}/rtsp/${cellId}/index.m3u8`;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

interface RtspSession {
  cellId: string;
  source: string;
  outputDir: string;
  process: ChildProcessWithoutNullStreams | null;
}

const rtspSessions = new Map<string, RtspSession>();
const mediaServer = new MediaServer(rtspSessions);
let mainWindow: BrowserWindow | null = null;
let selectedLocalVideoForTests: LocalVideoSelection | null = null;
let importedPresetForTests: Preset | null = null;

const isDev = !app.isPackaged;
const shouldUseDevServer = isDev && !isTestMode;

function inferSourceType(value: string): SourceType | null {
  const lower = value.toLowerCase();

  if (lower.startsWith('rtsp://')) {
    return 'rtsp';
  }

  if (lower.endsWith('.m3u8')) {
    return 'hls';
  }

  if (lower.endsWith('.mpd')) {
    return 'dash';
  }

  const localExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm'];
  if (localExtensions.some((extension) => lower.endsWith(extension))) {
    return 'local';
  }

  return null;
}

async function validateSource(value: string, local: boolean): Promise<SourceValidationResult> {
  if (!value.trim()) {
    return { ok: false, message: 'Source is required.' };
  }

  if (local) {
    if (!fs.existsSync(value)) {
      return { ok: false, message: 'Selected file does not exist.' };
    }

    const sourceType = inferSourceType(value);
    if (sourceType !== 'local') {
      return {
        ok: false,
        message: 'Supported local files: MP4, MKV, MOV, AVI, WebM.'
      };
    }

    return { ok: true, sourceType, isLive: false };
  }

  const sourceType = inferSourceType(value);
  if (!sourceType) {
    return {
      ok: false,
      message: 'Supported stream inputs are HLS (.m3u8), DASH (.mpd), or RTSP.'
    };
  }

  if (sourceType === 'rtsp') {
    return { ok: true, sourceType, isLive: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(value, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        message: `Source returned HTTP ${response.status}.`
      };
    }

    return { ok: true, sourceType, isLive: true };
  } catch {
    return {
      ok: false,
      message: 'Unable to reach the stream URL during validation.'
    };
  }
}

function stopRtspSession(cellId: string): void {
  const session = rtspSessions.get(cellId);
  if (!session) {
    return;
  }

  session.process?.kill('SIGTERM');
  rtspSessions.delete(cellId);
  fs.rmSync(session.outputDir, { recursive: true, force: true });
}

async function resolveSource(
  cellId: string,
  value: string,
  sourceType: SourceType
): Promise<ResolvedSource> {
  if (sourceType === 'local') {
    return {
      sourceType,
      originalSource: value,
      playbackUrl: await mediaServer.localFileUrl(value),
      isLive: false
    };
  }

  if (sourceType === 'rtsp') {
    stopRtspSession(cellId);
    const outputDir = path.join(os.tmpdir(), `grid-video-${createHash('sha1').update(cellId).digest('hex')}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const ffmpegArgs = [
      '-rtsp_transport',
      'tcp',
      '-i',
      value,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-f',
      'hls',
      '-hls_time',
      '1',
      '-hls_list_size',
      '4',
      '-hls_flags',
      'delete_segments+append_list',
      path.join(outputDir, 'index.m3u8')
    ];

    let process: ChildProcessWithoutNullStreams | null = null;
    try {
      process = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
    } catch {
      throw new Error('Failed to start FFmpeg. Make sure ffmpeg is installed and on PATH.');
    }

    rtspSessions.set(cellId, { cellId, source: value, outputDir, process });

    return {
      sourceType,
      originalSource: value,
      playbackUrl: await mediaServer.rtspUrl(cellId),
      isLive: true
    };
  }

  return {
    sourceType,
    originalSource: value,
    playbackUrl: value,
    isLive: true
  };
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0a0d14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (shouldUseDevServer) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  Array.from(rtspSessions.keys()).forEach(stopRtspSession);
  await mediaServer.stop().catch(() => undefined);
});

ipcMain.handle('storage:load-session', () => {
  return readSession();
});

ipcMain.handle('storage:save-session', (_event, session: GridSession) => {
  writeSession(session);
});

ipcMain.handle('dialog:select-local-video', async () => {
  if (isTestMode) {
    return selectedLocalVideoForTests;
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Video',
        extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm']
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    source: filePath,
    label: path.basename(filePath, path.extname(filePath))
  } satisfies LocalVideoSelection;
});

ipcMain.handle('source:validate', (_event, value: string, local: boolean) => {
  return validateSource(value, local);
});

ipcMain.handle('source:resolve', (_event, payload: { cellId: string; value: string; sourceType: SourceType }) => {
  return resolveSource(payload.cellId, payload.value, payload.sourceType);
});

ipcMain.handle('source:stop-rtsp', (_event, cellId: string) => {
  stopRtspSession(cellId);
});

ipcMain.handle('preset:export', async (_event, preset: Preset) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `${preset.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'preset'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return false;
  }

  fs.writeFileSync(result.filePath, `${JSON.stringify(preset, null, 2)}\n`, 'utf8');
  return true;
});

ipcMain.handle('preset:import', async () => {
  if (isTestMode && importedPresetForTests) {
    return importedPresetForTests;
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    return JSON.parse(raw) as Preset;
  } catch {
    return null;
  }
});

ipcMain.handle('screenshots:save', async (_event, shots: ScreenshotPayload[]) => {
  const outputDir = path.join(app.getPath('pictures'), 'grid-video-player');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  return shots.map((shot, index) => {
    const filePath = path.join(outputDir, `${stamp}-${index + 1}-${shot.cellId}.png`);
    const base64 = shot.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  });
});

if (isTestMode) {
  ipcMain.handle('test:reset-session', () => {
    writeSession(DEFAULT_SESSION);
    selectedLocalVideoForTests = null;
    importedPresetForTests = null;
  });

  ipcMain.handle('test:seed-session', (_event, session: GridSession) => {
    writeSession(session);
  });

  ipcMain.handle('test:get-session', () => {
    return readSession();
  });

  ipcMain.handle('test:set-selected-local-video', (_event, value: LocalVideoSelection | null) => {
    selectedLocalVideoForTests = value;
  });

  ipcMain.handle('test:set-imported-preset', (_event, preset: Preset | null) => {
    importedPresetForTests = preset;
  });
}
