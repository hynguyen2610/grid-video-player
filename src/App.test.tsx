import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { resetGridStore, useGridStore } from './state/grid-store';
import type {
  FolderVideoSelection,
  GridSession,
  LocalVideoSelection,
  Preset,
  ResolvedSource,
  ScreenshotPayload,
  SourceType,
  SourceValidationResult
} from './shared/types';

function createBridgeMock(session?: GridSession) {
  return {
    loadSession: vi.fn().mockResolvedValue(session ?? { cells: [], presets: [], recentSources: [] }),
    saveSession: vi.fn().mockResolvedValue(undefined),
    selectLocalVideo: vi.fn<() => Promise<LocalVideoSelection | null>>().mockResolvedValue(null),
    selectVideoFolder: vi.fn<() => Promise<FolderVideoSelection[]>>().mockResolvedValue([]),
    validateSource: vi.fn<(value: string, local: boolean) => Promise<SourceValidationResult>>(),
    resolveSource: vi.fn<
      (cellId: string, value: string, sourceType: SourceType) => Promise<ResolvedSource>
    >(),
    stopRtspBridge: vi.fn().mockResolvedValue(undefined),
    exportPreset: vi.fn<(preset: Preset) => Promise<boolean>>().mockResolvedValue(true),
    importPreset: vi.fn().mockResolvedValue(null),
    saveScreenshots: vi.fn<(shots: ScreenshotPayload[]) => Promise<string[]>>().mockResolvedValue([])
  };
}

function createStatefulBridge(initialSession?: GridSession) {
  let session = initialSession ?? { cells: [], presets: [], recentSources: [] };
  const bridge = createBridgeMock(session);

  bridge.loadSession.mockImplementation(async () => session);
  bridge.saveSession.mockImplementation(async (nextSession: GridSession) => {
    session = JSON.parse(JSON.stringify(nextSession)) as GridSession;
  });

  return {
    bridge,
    getSession: () => session
  };
}

describe('App UI behavior', () => {
  beforeEach(() => {
    resetGridStore();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null
    });
  });

  it('adds a cell through the source picker and keeps the add tile available', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    bridge.validateSource.mockResolvedValue({
      ok: true,
      sourceType: 'local',
      isLive: false
    });
    bridge.selectLocalVideo.mockResolvedValue({
      source: '/videos/garage.mp4',
      label: 'Garage'
    });
    bridge.resolveSource.mockResolvedValue({
      sourceType: 'local',
      originalSource: '/videos/garage.mp4',
      playbackUrl: 'http://127.0.0.1/local/garage.mp4',
      isLive: false
    });

    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('The wall is ready.');
    await user.click(screen.getByTestId('toolbar-add-video'));

    await waitFor(() => {
      expect(bridge.resolveSource).toHaveBeenCalledWith(
        expect.any(String),
        '/videos/garage.mp4',
        'local'
      );
    });

    expect(await screen.findByText('Garage')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /\+ Add Video|Add Video/ }).length).toBeGreaterThan(0);
    expect(useGridStore.getState().cells.filter((cell) => cell.source)).toHaveLength(1);
    expect(useGridStore.getState().recentSources).toEqual(['/videos/garage.mp4']);
  });

  it('applies mute all to every active cell from the toolbar', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock({
      cells: [
        {
          id: 'cell-1',
          colSpan: 1,
          rowSpan: 1,
          label: 'Front Door',
          source: '/videos/front-door.mp4',
          sourceKey: 'local:front-door',
          sourceType: 'local',
          resolvedSource: 'http://127.0.0.1/local/front-door.mp4',
          playing: false,
          muted: false,
          volume: 80,
          currentTime: 0,
          duration: 120,
          isLive: false,
          status: 'ready',
          error: null
        },
        {
          id: 'cell-2',
          colSpan: 1,
          rowSpan: 1,
          label: 'Garage',
          source: '/videos/garage.mp4',
          sourceKey: 'local:garage',
          sourceType: 'local',
          resolvedSource: 'http://127.0.0.1/local/garage.mp4',
          playing: true,
          muted: false,
          volume: 65,
          currentTime: 12,
          duration: 90,
          isLive: false,
          status: 'ready',
          error: null
        }
      ],
      presets: [],
      recentSources: []
    });
    bridge.selectLocalVideo.mockResolvedValue({
      source: '/videos/front-door.mp4',
      label: 'Front Door'
    });

    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('Front Door');
    await user.click(screen.getByRole('button', { name: 'Mute All' }));

    await waitFor(() => {
      expect(
        useGridStore
          .getState()
          .cells.filter((cell) => cell.source)
          .every((cell) => cell.muted)
      ).toBe(true);
    });

    const garageTitle = screen.getByText('Garage');
    const garageCell = garageTitle.closest('.group');
    expect(garageCell).not.toBeNull();
    expect(within(garageCell as HTMLElement).getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('opens the picker for the clicked empty cell and assigns the video to that cell', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    bridge.selectLocalVideo.mockResolvedValue({
      source: '/videos/lobby.mp4',
      label: 'Lobby'
    });
    bridge.resolveSource.mockResolvedValue({
      sourceType: 'local',
      originalSource: '/videos/lobby.mp4',
      playbackUrl: 'http://127.0.0.1/local/lobby.mp4',
      isLive: false
    });

    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('The wall is ready.');

    const emptyCellIds = useGridStore
      .getState()
      .cells.filter((cell) => !cell.source)
      .map((cell) => cell.id);
    const targetCellId = emptyCellIds[4];

    await user.click(screen.getByTestId(`video-cell-add-${targetCellId}`));

    await waitFor(() => {
      expect(bridge.resolveSource).toHaveBeenCalledWith(
        targetCellId,
        '/videos/lobby.mp4',
        'local'
      );
    });

    const updatedTargetCell = useGridStore.getState().cells.find((cell) => cell.id === targetCellId);
    expect(updatedTargetCell?.label).toBe('Lobby');
    expect(updatedTargetCell?.source).toBe('/videos/lobby.mp4');

    const activeCells = useGridStore.getState().cells.filter((cell) => cell.source);
    expect(activeCells).toHaveLength(1);
    expect(activeCells[0]?.id).toBe(targetCellId);
  });

  it('hides the top toolbar while fullscreen mode is active', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    window.gridVideo = bridge;

    const requestFullscreen = vi.fn(async function (this: HTMLElement) {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: this
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: null
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen
    });

    render(<App />);

    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeInTheDocument();
  });

  it('restores fullscreen after picking a video from an empty cell', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    bridge.selectLocalVideo.mockImplementation(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: null
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      return {
        source: '/videos/fullscreen-cell.mp4',
        label: 'Fullscreen Cell'
      };
    });
    bridge.resolveSource.mockResolvedValue({
      sourceType: 'local',
      originalSource: '/videos/fullscreen-cell.mp4',
      playbackUrl: 'http://127.0.0.1/local/fullscreen-cell.mp4',
      isLive: false
    });
    window.gridVideo = bridge;

    const requestFullscreen = vi.fn(async function (this: HTMLElement) {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: this
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(async () => {
        Object.defineProperty(document, 'fullscreenElement', {
          configurable: true,
          writable: true,
          value: null
        });
        document.dispatchEvent(new Event('fullscreenchange'));
      })
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeInTheDocument();
    });

    const emptyCellIds = useGridStore
      .getState()
      .cells.filter((cell) => !cell.source)
      .map((cell) => cell.id);
    const targetCellId = emptyCellIds[2];

    await user.click(screen.getByTestId(`video-cell-add-${targetCellId}`));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit Fullscreen' })).toBeInTheDocument();
  });

  it('stores resized grid spans without affecting the video source assignment model', async () => {
    const bridge = createBridgeMock();
    window.gridVideo = bridge;

    render(<App />);

    const targetCell = useGridStore.getState().cells[0];
    useGridStore.getState().setCellSpan(targetCell.id, 2, 3);

    await waitFor(() => {
      const updatedCell = useGridStore.getState().cells.find((cell) => cell.id === targetCell.id);
      expect(updatedCell?.colSpan).toBe(2);
      expect(updatedCell?.rowSpan).toBe(3);
    });
  });

  it('keeps the sidebar scrollable and scopes layout mode changes to the video grid', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('The wall is ready.');

    expect(useGridStore.getState().layoutMode).toBe('fit');
    expect(screen.getByTestId('app-shell').className).toContain('h-screen');
    expect(screen.getByTestId('video-library-scroll-region').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('video-library-scroll-region').className).toContain('overscroll-contain');
    expect(screen.getByTestId('grid-viewport').className).toContain('overflow-hidden');

    await user.click(screen.getByRole('button', { name: 'Grid Config' }));
    await user.click(screen.getByRole('button', { name: /Scrolling/i }));
    await user.click(screen.getByRole('button', { name: 'Apply Grid' }));

    await waitFor(() => {
      expect(useGridStore.getState().layoutMode).toBe('scroll');
    });
    expect(screen.getByTestId('app-shell').className).toContain('h-screen');
    expect(screen.getByTestId('video-library-scroll-region').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('video-library-scroll-region').className).toContain('overscroll-contain');
    expect(screen.getByTestId('grid-viewport').className).toContain('overflow-y-auto');
  });

  it('defaults to compact mode and lets the user switch back to expanded chrome', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock({
      cells: [
        {
          id: 'cell-1',
          colSpan: 1,
          rowSpan: 1,
          label: 'Front Door',
          source: '/videos/front-door.mp4',
          sourceKey: 'local:front-door',
          sourceType: 'local',
          resolvedSource: 'http://127.0.0.1/local/front-door.mp4',
          playing: false,
          muted: false,
          volume: 80,
          currentTime: 0,
          duration: 120,
          isLive: false,
          status: 'ready',
          error: null
        }
      ],
      presets: [],
      recentSources: []
    });
    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('Front Door');

    expect(useGridStore.getState().compactMode).toBe(true);
    expect(screen.getByTestId('video-cell-overlay-controls-cell-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change Video' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Grid Config' }));
    await user.click(screen.getByRole('button', { name: /Expanded/i }));
    await user.click(screen.getByRole('button', { name: 'Apply Grid' }));

    await waitFor(() => {
      expect(useGridStore.getState().compactMode).toBe(false);
    });

    expect(screen.queryByTestId('video-cell-overlay-controls-cell-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('lists folder videos in the sidebar and supports drag drop with active session counts', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock();
    bridge.selectVideoFolder.mockResolvedValue([
      {
        source: 'blob:camera-a',
        label: 'Camera A',
        sourceKey: 'local:camera-a',
        thumbnailSource: 'data:image/png;base64,thumb-a'
      }
    ]);
    bridge.resolveSource.mockResolvedValue({
      sourceType: 'local',
      originalSource: 'blob:camera-a',
      playbackUrl: 'blob:camera-a',
      isLive: false
    });
    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('The wall is ready.');
    await user.click(screen.getByRole('button', { name: 'Pick Folder' }));

    const sidebarCard = await screen.findByTestId('sidebar-video-Camera A');
    expect(within(sidebarCard).getByText('Camera A')).toBeInTheDocument();

    const targetCell = useGridStore.getState().cells[0];
    const dataTransfer = {
      types: ['application/x-grid-video'],
      getData: vi.fn().mockReturnValue(
        JSON.stringify({
          source: 'blob:camera-a',
          label: 'Camera A',
          sourceKey: 'local:camera-a'
        })
      ),
      setData: vi.fn(),
      effectAllowed: 'copy',
      dropEffect: 'copy'
    };

    fireEvent.dragOver(screen.getByTestId(`video-cell-${targetCell.id}`), { dataTransfer });
    fireEvent.drop(screen.getByTestId(`video-cell-${targetCell.id}`), { dataTransfer });

    await waitFor(() => {
      expect(bridge.resolveSource).toHaveBeenCalledWith(targetCell.id, 'blob:camera-a', 'local');
    });

    expect(within(sidebarCard).getByText('1')).toBeInTheDocument();

    const secondCell = useGridStore.getState().cells.find((cell) => cell.id !== targetCell.id && !cell.source);
    expect(secondCell).toBeDefined();

    fireEvent.dragOver(screen.getByTestId(`video-cell-${secondCell!.id}`), { dataTransfer });
    fireEvent.drop(screen.getByTestId(`video-cell-${secondCell!.id}`), { dataTransfer });

    await waitFor(() => {
      expect(useGridStore.getState().cells.filter((cell) => cell.sourceKey === 'local:camera-a')).toHaveLength(2);
    });

    expect(within(sidebarCard).getByText('2')).toBeInTheDocument();
  });

  it('restores sidebar state and library videos from the saved session on load', async () => {
    const bridge = createBridgeMock({
      cells: [],
      presets: [],
      recentSources: [],
      sidebarOpen: false,
      libraryVideos: [
        {
          source: 'blob:restored-camera',
          label: 'Restored Camera',
          sourceKey: 'local:restored-camera',
          thumbnailSource: 'data:image/png;base64,restored'
        }
      ]
    });
    window.gridVideo = bridge;

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Show Library' })).toBeInTheDocument();
    expect(screen.queryByText('Restored Camera')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Show Library' }));

    expect(await screen.findByText('Restored Camera')).toBeInTheDocument();
  });

  it('flushes app state on page reload so sidebar status survives immediate remount', async () => {
    const user = userEvent.setup();
    const { bridge, getSession } = createStatefulBridge({
      cells: [],
      presets: [],
      recentSources: [],
      sidebarOpen: true,
      libraryVideos: []
    });
    window.gridVideo = bridge;

    const firstRender = render(<App />);

    await screen.findByRole('button', { name: 'Hide Library' });
    await user.click(screen.getByRole('button', { name: 'Hide Library' }));

    fireEvent(window, new Event('pagehide'));
    await waitFor(() => {
      expect(getSession().sidebarOpen).toBe(false);
    });

    firstRender.unmount();
    resetGridStore();

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Show Library' })).toBeInTheDocument();
  });

  it('toggles play and pause when clicking on the video cell surface', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock({
      cells: [
        {
          id: 'cell-1',
          colSpan: 1,
          rowSpan: 1,
          label: 'Lobby',
          source: '/videos/lobby.mp4',
          sourceKey: 'local:lobby',
          sourceType: 'local',
          resolvedSource: 'http://127.0.0.1/local/lobby.mp4',
          playing: false,
          muted: false,
          volume: 80,
          currentTime: 0,
          duration: 120,
          isLive: false,
          status: 'ready',
          error: null
        }
      ],
      presets: [],
      recentSources: []
    });
    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('Lobby');
    const cellSurface = screen.getByTestId('video-cell-cell-1');

    await user.click(cellSurface);
    await waitFor(() => {
      expect(useGridStore.getState().cells.find((cell) => cell.id === 'cell-1')?.playing).toBe(true);
    });

    await user.click(cellSurface);
    await waitFor(() => {
      expect(useGridStore.getState().cells.find((cell) => cell.id === 'cell-1')?.playing).toBe(false);
    });
  });

  it('does not toggle playback when clicking non-playback in-cell controls', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock({
      cells: [
        {
          id: 'cell-1',
          colSpan: 1,
          rowSpan: 1,
          label: 'Lobby',
          source: '/videos/lobby.mp4',
          sourceKey: 'local:lobby',
          sourceType: 'local',
          resolvedSource: 'http://127.0.0.1/local/lobby.mp4',
          playing: true,
          muted: false,
          volume: 80,
          currentTime: 0,
          duration: 120,
          isLive: false,
          status: 'ready',
          error: null
        }
      ],
      presets: [],
      recentSources: []
    });
    window.gridVideo = bridge;

    render(<App />);

    await screen.findByText('Lobby');

    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(useGridStore.getState().cells.find((cell) => cell.id === 'cell-1')?.playing).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(useGridStore.getState().cells.find((cell) => cell.id === 'cell-1')?.source).toBeNull();
  });
});
