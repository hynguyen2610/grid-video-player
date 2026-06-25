import { useState } from 'react';
import type { SourceType } from '../shared/types';
import { inferSourceType } from '../utils/source';

interface SourcePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { source: string; sourceType: SourceType; label: string }) => Promise<void>;
  recentSources: string[];
  initialLabel?: string;
}

export function SourcePickerDialog({
  open,
  onClose,
  onConfirm,
  recentSources,
  initialLabel = ''
}: SourcePickerDialogProps) {
  const [tab, setTab] = useState<'local' | 'url'>('local');
  const [label, setLabel] = useState(initialLabel);
  const [source, setSource] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return null;
  }

  async function chooseLocalFile() {
    const filePath = await window.gridVideo.selectLocalVideo();
    if (filePath) {
      setSource(filePath);
      if (!label) {
        setLabel(filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '');
      }
    }
  }

  async function handleValidateAndConfirm() {
    setBusy(true);
    setMessage(null);

    const validation = await window.gridVideo.validateSource(source, tab === 'local');
    if (!validation.ok || !validation.sourceType) {
      setMessage(validation.message ?? 'Unable to validate source.');
      setBusy(false);
      return;
    }

    try {
      await onConfirm({
        source,
        sourceType: validation.sourceType,
        label: label.trim() || source.split(/[\\/]/).pop() || 'Untitled'
      });
      setBusy(false);
      onClose();
      setSource('');
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add source.');
      setBusy(false);
    }
  }

  const canSubmit = !!source.trim() && !busy && !!inferSourceType(source);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-panel p-6 shadow-glow">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accentSoft">Source picker</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Add or replace a video source</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-2 text-sm text-slate-300 transition hover:border-accent hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-2 rounded-2xl bg-card p-1">
          {[
            ['local', 'Local File'],
            ['url', 'Stream URL']
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value as 'local' | 'url')}
              className={`flex-1 rounded-xl px-4 py-3 text-sm transition ${
                tab === value ? 'bg-accent text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-slate-300">
            Label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="rounded-2xl border border-border bg-canvas px-4 py-3 text-white outline-none ring-0 transition focus:border-accent"
              placeholder="Front Door Camera"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            {tab === 'local' ? 'Selected file' : 'Stream URL'}
            <div className="flex gap-3">
              <input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder={tab === 'local' ? '/path/to/file.mp4' : 'https://example.com/live.m3u8'}
                className="min-w-0 flex-1 rounded-2xl border border-border bg-canvas px-4 py-3 text-white outline-none transition focus:border-accent"
              />
              {tab === 'local' ? (
                <button
                  type="button"
                  onClick={chooseLocalFile}
                  className="rounded-2xl border border-border px-4 py-3 text-sm text-slate-200 transition hover:border-accent hover:text-white"
                >
                  Browse
                </button>
              ) : null}
            </div>
          </label>

          {recentSources.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm text-slate-400">Recent sources</p>
              <div className="flex flex-wrap gap-2">
                {recentSources.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => setSource(recent)}
                    className="rounded-full border border-border px-3 py-2 text-xs text-slate-300 transition hover:border-accent hover:text-white"
                  >
                    {recent}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-danger/60 bg-danger/10 px-4 py-3 text-sm text-rose-200">
              {message}
            </div>
          ) : null}
        </div>

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
            disabled={!canSubmit}
            onClick={handleValidateAndConfirm}
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-slate-900 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Validating...' : 'Validate & Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
