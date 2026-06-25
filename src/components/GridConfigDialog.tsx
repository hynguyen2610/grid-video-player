import { useEffect, useState } from 'react';
import { maxGridDimension } from '../state/grid-store';

interface GridConfigDialogProps {
  open: boolean;
  initialRows: number;
  initialColumns: number;
  onClose: () => void;
  onApply: (rows: number, columns: number) => void;
}

export function GridConfigDialog({
  open,
  initialRows,
  initialColumns,
  onClose,
  onApply
}: GridConfigDialogProps) {
  const [rows, setRows] = useState(initialRows);
  const [columns, setColumns] = useState(initialColumns);

  useEffect(() => {
    if (open) {
      setRows(initialRows);
      setColumns(initialColumns);
    }
  }, [initialColumns, initialRows, open]);

  if (!open) {
    return null;
  }

  const options = Array.from({ length: maxGridDimension }, (_, index) => index + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-panel p-6 shadow-glow">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.3em] text-accentSoft">Grid config</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Choose the wall layout</h2>
          <p className="mt-2 text-sm text-slate-400">
            Empty cells stay visible and each slot can hold one local video.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-2 text-sm text-slate-300">
            Rows
            <select
              value={rows}
              onChange={(event) => setRows(Number(event.target.value))}
              className="rounded-2xl border border-border bg-canvas px-4 py-3 text-white outline-none transition focus:border-accent"
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            Columns
            <select
              value={columns}
              onChange={(event) => setColumns(Number(event.target.value))}
              className="rounded-2xl border border-border bg-canvas px-4 py-3 text-white outline-none transition focus:border-accent"
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm text-slate-400">
          Result: {rows} x {columns} ({rows * columns} slots)
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border px-4 py-3 text-sm text-slate-300 transition hover:border-accent hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(rows, columns);
              onClose();
            }}
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-slate-900 transition hover:brightness-105"
          >
            Apply Grid
          </button>
        </div>
      </div>
    </div>
  );
}
