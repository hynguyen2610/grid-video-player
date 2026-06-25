import { create } from 'zustand';
import type { Cell, GridSession, LayoutMode, Preset, SourceType } from '../shared/types';
import { getGridTier } from '../utils/grid';

const DEFAULT_GRID_COLUMNS = 3;
const DEFAULT_GRID_ROWS = 3;
const DEFAULT_LAYOUT_MODE: LayoutMode = 'fit';
const MAX_GRID_DIMENSION = 6;
const MAX_CELLS = 36;

function createEmptyCell(params: Partial<Cell> & Pick<Cell, 'id'>): Cell {
  return {
    id: params.id,
    colSpan: params.colSpan ?? 1,
    rowSpan: params.rowSpan ?? 1,
    source: params.source ?? null,
    sourceType: params.sourceType ?? null,
    resolvedSource: params.resolvedSource ?? null,
    label: params.label ?? 'Empty',
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

function createGridCells(count: number, existingCells: Cell[] = []): Cell[] {
  return Array.from({ length: count }, (_, index) => {
    const existing = existingCells[index];
    return existing ? createEmptyCell(existing) : createEmptyCell({ id: crypto.randomUUID() });
  });
}

function clearCell(cell: Cell): Cell {
  return createEmptyCell({
    id: cell.id,
    colSpan: 1,
    rowSpan: 1,
    muted: false,
    playing: false,
    volume: 80
  });
}

function clampGridDimension(value: number): number {
  return Math.max(1, Math.min(MAX_GRID_DIMENSION, Math.floor(value)));
}

interface GridState extends GridSession {
  hydrated: boolean;
  columns: number;
  rows: number;
  tier: ReturnType<typeof getGridTier>;
  layoutMode: LayoutMode;
  setGridSize: (rows: number, columns: number) => void;
  setLayoutMode: (layoutMode: LayoutMode) => void;
  addCell: (cell?: Partial<Cell>) => string | null;
  removeCell: (id: string) => void;
  replaceCellSource: (id: string, source: string, sourceType: SourceType, label?: string) => void;
  setResolvedSource: (id: string, resolvedSource: string, isLive: boolean) => void;
  setCellPlayback: (id: string, playing: boolean) => void;
  setCellSpan: (id: string, colSpan: number, rowSpan: number) => void;
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

function deriveGrid(columns: number, rows: number) {
  const safeColumns = clampGridDimension(columns);
  const safeRows = clampGridDimension(rows);
  const tier = getGridTier(safeColumns * safeRows);
  return { columns: safeColumns, rows: safeRows, tier };
}

const initialGridState: Pick<
  GridState,
  'cells' | 'presets' | 'recentSources' | 'hydrated' | 'columns' | 'rows' | 'tier' | 'layoutMode'
> = {
  cells: createGridCells(DEFAULT_GRID_COLUMNS * DEFAULT_GRID_ROWS),
  presets: [],
  recentSources: [],
  hydrated: false,
  layoutMode: DEFAULT_LAYOUT_MODE,
  ...deriveGrid(DEFAULT_GRID_COLUMNS, DEFAULT_GRID_ROWS)
};

export const useGridStore = create<GridState>((set, get) => ({
  ...initialGridState,
  setGridSize: (rows, columns) => {
    const nextRows = clampGridDimension(rows);
    const nextColumns = clampGridDimension(columns);
    const count = Math.min(nextRows * nextColumns, MAX_CELLS);
    const trimmedCells = get().cells.slice(0, count).map((cell) =>
      createEmptyCell({
        ...cell,
        colSpan: Math.min(cell.colSpan, nextColumns),
        rowSpan: Math.min(cell.rowSpan, nextRows)
      })
    );
    set({
      cells: createGridCells(count, trimmedCells),
      ...deriveGrid(nextColumns, nextRows)
    });
  },
  setLayoutMode: (layoutMode) => {
    set({ layoutMode });
  },
  addCell: (cell) => {
    const emptyCell = get().cells.find((entry) => !entry.source);
    if (!emptyCell) {
      return null;
    }

    const id = emptyCell.id;
    set({
      cells: get().cells.map((entry) =>
        entry.id === id ? createEmptyCell({ ...entry, ...cell, id }) : entry
      )
    });
    return id;
  },
  removeCell: (id) => {
    set({
      cells: get().cells.map((cell) => (cell.id === id ? clearCell(cell) : cell))
    });
  },
  replaceCellSource: (id, source, sourceType, label) => {
    set({
      cells: get().cells.map((cell) =>
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
              isLive: sourceType !== 'local',
              playing: false
            }
          : cell
      )
    });
  },
  setResolvedSource: (id, resolvedSource, isLive) => {
    set({
      cells: get().cells.map((cell) =>
        cell.id === id
          ? {
              ...cell,
              resolvedSource,
              isLive,
              status: 'ready' as const,
              error: null
            }
          : cell
      )
    });
  },
  setCellPlayback: (id, playing) => {
    set({
      cells: get().cells.map((cell) => (cell.id === id ? { ...cell, playing } : cell))
    });
  },
  setCellSpan: (id, colSpan, rowSpan) => {
    const maxColumns = get().columns;
    const maxRows = get().rows;
    set({
      cells: get().cells.map((cell) =>
        cell.id === id
          ? {
              ...cell,
              colSpan: Math.max(1, Math.min(maxColumns, Math.round(colSpan))),
              rowSpan: Math.max(1, Math.min(maxRows, Math.round(rowSpan)))
            }
          : cell
      )
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
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      columns: get().columns,
      rows: get().rows,
      cells: get().cells.map((cell, index) => ({
        index,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
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
    const count = Math.min(preset.columns * preset.rows, MAX_CELLS);
    const slotMap = new Map(preset.cells.map((cell) => [cell.index, cell]));
    const cells = Array.from({ length: count }, (_, index) => {
      const presetCell = slotMap.get(index);
      return createEmptyCell({
        id: crypto.randomUUID(),
        colSpan: Math.min(presetCell?.colSpan ?? 1, preset.columns),
        rowSpan: Math.min(presetCell?.rowSpan ?? 1, preset.rows),
        label: presetCell?.label ?? 'Empty',
        source: presetCell?.source ?? null,
        sourceType: presetCell?.sourceType ?? null
      });
    });

    set({
      cells,
      ...deriveGrid(preset.columns, preset.rows)
    });
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

    const rows = session.gridRows ?? DEFAULT_GRID_ROWS;
    const columns = session.gridColumns ?? DEFAULT_GRID_COLUMNS;
    const count = Math.min(rows * columns, MAX_CELLS);
    set({
      cells: createGridCells(count, session.cells.slice(0, count)),
      presets: session.presets,
      recentSources: session.recentSources,
      layoutMode: session.layoutMode ?? DEFAULT_LAYOUT_MODE,
      hydrated: true,
      ...deriveGrid(columns, rows)
    });
  }
}));

export function selectSession(state: GridState): GridSession {
  return {
    gridColumns: state.columns,
    gridRows: state.rows,
    layoutMode: state.layoutMode,
    cells: state.cells,
    presets: state.presets,
    recentSources: state.recentSources
  };
}

export function resetGridStore() {
  useGridStore.setState({
    ...initialGridState,
    cells: createGridCells(DEFAULT_GRID_COLUMNS * DEFAULT_GRID_ROWS)
  });
}

export const defaultGridColumns = DEFAULT_GRID_COLUMNS;
export const defaultGridRows = DEFAULT_GRID_ROWS;
export const defaultLayoutMode = DEFAULT_LAYOUT_MODE;
export const maxGridDimension = MAX_GRID_DIMENSION;
