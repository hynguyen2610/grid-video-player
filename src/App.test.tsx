import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { resetGridStore, useGridStore } from './state/grid-store';
import type {
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

describe('App UI behavior', () => {
  beforeEach(() => {
    resetGridStore();
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

    await screen.findByText('The grid is empty.');
    await user.click(screen.getAllByText('Add Video')[0]);

    await waitFor(() => {
      expect(bridge.resolveSource).toHaveBeenCalledWith(
        expect.any(String),
        '/videos/garage.mp4',
        'local'
      );
    });

    expect(await screen.findByText('Garage')).toBeInTheDocument();
    expect(screen.getAllByText('Add Video').length).toBeGreaterThan(0);
    expect(useGridStore.getState().cells).toHaveLength(1);
    expect(useGridStore.getState().recentSources).toEqual(['/videos/garage.mp4']);
  });

  it('applies mute all to every active cell from the toolbar', async () => {
    const user = userEvent.setup();
    const bridge = createBridgeMock({
      cells: [
        {
          id: 'cell-1',
          label: 'Front Door',
          source: '/videos/front-door.mp4',
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
          label: 'Garage',
          source: '/videos/garage.mp4',
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
      expect(useGridStore.getState().cells.every((cell) => cell.muted)).toBe(true);
    });

    const garageTitle = screen.getByText('Garage');
    const garageCell = garageTitle.closest('.group');
    expect(garageCell).not.toBeNull();
    expect(within(garageCell as HTMLElement).getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });
});
