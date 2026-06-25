import { create } from 'zustand';
import type { Cell, GridSession, Preset, SourceType } from '../shared/types';
import { getGridColumns, getGridRows, getGridTier } from '../utils/grid';

const MAX_CELLS = 36;

function createEmptyCell(params: Partial<Cell> & Pick<Cell, 'id'>): Cell {
  return {
    id: params.id,
    source: params.source ?? null,
    sourceType: params.sourceType ?? null,
    resolvedSource: params.resolvedSource ?? null,
    label: params.label ?? 'Untitled',
    playing: params.playing ?? false,
    muted: params.muted ?? false,
    volume: params.volume ?? 80,
    currentTime: params.currentTime ?? 0,
    duration: params.duration ?? null,
    isLive: params.isLive ?? false,
    status: params.status ?? 'idle',
    error: params.error ?? null
  };
}

interface GridState extends GridSession {
  hydrated: boolean;
  columns: number;
  rows: number;
  tier: ReturnType<typeof getGridTier>;
  addCell: (cell?: Partial<Cell>) => string | null;
  removeCell: (id: string) => void;
  replaceCellSource: (id: string, source: string, sourceType: SourceType, label?: string) => void;
  setResolvedSource: (id: string, resolvedSource: string, isLive: boolean) => void;
  setCellPlayback: (id: string, playing: boolean) => void;
  setCellMuted: (id: string, muted: boolean) => void;
  setCellVolume: (id: string, volume: number) => void;
  setCellTime: (id: string, currentTime: number, duration: number | null) => void;
  setCellStatus: (id: string, status: Cell['status'], error?: string | null) => void;
  savePreset: (name: string) => void;
  deletePreset: (id: string) => void;
  loadPreset: (preset: Preset) => void;
  importPreset: (preset: Preset) => void;
  setRecentSources: (sources: string[]) => void;
  rememberRecentSource: (source: string) => void;
  hydrateSession: (session: GridSession | null) => void;
}

const initialGridState: Pick<
  GridState,
  'cells' | 'presets' | 'recentSources' | 'hydrated' | 'columns' | 'rows' | 'tier'
> = {
  cells: [],
  presets: [],
  recentSources: [],
  hydrated: false,
  ...deriveGrid([])
};

function deriveGrid(cells: Cell[]) {
  const columns = getGridColumns(cells.length || 1);
  const rows = getGridRows(cells.length || 1);
  const tier = getGridTier(cells.length || 1);
  return { columns, rows, tier };
}

export const useGridStore = create<GridState>((set, get) => ({
  ...initialGridState,
  addCell: (cell) => {
    if (get().cells.length >= MAX_CELLS) {
      return null;
    }

    const id = cell?.id ?? crypto.randomUUID();
    const cells = [...get().cells, createEmptyCell({ id, ...cell })];
    set({ cells, ...deriveGrid(cells) });
    return id;
  },
  removeCell: (id) => {
    const cells = get().cells.filter((cell) => cell.id !== id);
    set({ cells, ...deriveGrid(cells) });
  },
  replaceCellSource: (id, source, sourceType, label) => {
    const cells = get().cells.map((cell) =>
      cell.id === id
        ? {
            ...cell,
            source,
            sourceType,
            resolvedSource: null,
            label: label ?? cell.label,
            currentTime: 0,
            duration: null,
            status: 'loading' as const,
            error: null,
            isLive: sourceType !== 'local'
          }
        : cell
    );

    set({ cells });
  },
  setResolvedSource: (id, resolvedSource, isLive) => {
    const cells = get().cells.map((cell) =>
      cell.id === id
        ? {
            ...cell,
            resolvedSource,
            isLive,
            status: 'ready' as const,
            error: null
          }
        : cell
    );

    set({ cells });
  },
  setCellPlayback: (id, playing) => {
    set({
      cells: get().cells.map((cell) => (cell.id === id ? { ...cell, playing } : cell))
    });
  },
  setCellMuted: (id, muted) => {
    set({
      cells: get().cells.map((cell) => (cell.id === id ? { ...cell, muted } : cell))
    });
  },
  setCellVolume: (id, volume) => {
    set({
      cells: get().cells.map((cell) => (cell.id === id ? { ...cell, volume } : cell))
    });
  },
  setCellTime: (id, currentTime, duration) => {
    set({
      cells: get().cells.map((cell) =>
        cell.id === id ? { ...cell, currentTime, duration } : cell
      )
    });
  },
  setCellStatus: (id, status, error = null) => {
    set({
      cells: get().cells.map((cell) =>
        cell.id === id ? { ...cell, status, error } : cell
      )
    });
  },
  savePreset: (name) => {
    const cells = get().cells;
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      columns: getGridColumns(cells.length || 1),
      rows: getGridRows(cells.length || 1),
      cells: cells.map((cell, index) => ({
        index,
        label: cell.label,
        source: cell.source,
        sourceType: cell.sourceType
      })),
      createdAt: new Date().toISOString()
    };

    set({ presets: [preset, ...get().presets] });
  },
  deletePreset: (id) => {
    set({ presets: get().presets.filter((preset) => preset.id !== id) });
  },
  loadPreset: (preset) => {
    const cells = preset.cells
      .filter((cell) => cell.source)
      .map((cell) =>
        createEmptyCell({
          id: crypto.randomUUID(),
          label: cell.label,
          source: cell.source,
          sourceType: cell.sourceType ?? null
        })
      );

    set({ cells, ...deriveGrid(cells) });
  },
  importPreset: (preset) => {
    set({
      presets: [preset, ...get().presets.filter((entry) => entry.id !== preset.id)]
    });
  },
  setRecentSources: (recentSources) => set({ recentSources }),
  rememberRecentSource: (source) => {
    const recentSources = [source, ...get().recentSources.filter((entry) => entry !== source)].slice(0, 10);
    set({ recentSources });
  },
  hydrateSession: (session) => {
    if (!session) {
      set({ hydrated: true });
      return;
    }

    set({
      cells: session.cells.map((cell) => createEmptyCell(cell)),
      presets: session.presets,
      recentSources: session.recentSources,
      hydrated: true,
      ...deriveGrid(session.cells)
    });
  }
}));

export function selectSession(state: GridState): GridSession {
  return {
    cells: state.cells,
    presets: state.presets,
    recentSources: state.recentSources
  };
}

export function resetGridStore() {
  useGridStore.setState(initialGridState);
}

export const maxCells = MAX_CELLS;
