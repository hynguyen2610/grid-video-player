import type { Preset } from '../shared/types';

interface ToolbarProps {
  onAdd: () => void;
  onPlayAll: () => void;
  onPauseAll: () => void;
  onMuteAll: (muted: boolean) => void;
  onSyncAll: () => void;
  onScreenshotAll: () => void;
  onSavePreset: () => void;
  onImportPreset: () => void;
  presets: Preset[];
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (presetId: string) => void;
  onExportPreset: (preset: Preset) => void;
}

const buttonClassName =
  'rounded-full border border-border bg-card px-4 py-2 text-sm text-slate-200 transition hover:border-accent hover:text-white';

export function Toolbar({
  onAdd,
  onPlayAll,
  onPauseAll,
  onMuteAll,
  onSyncAll,
  onScreenshotAll,
  onSavePreset,
  onImportPreset,
  presets,
  onLoadPreset,
  onDeletePreset,
  onExportPreset
}: ToolbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-canvas/90 backdrop-blur">
      <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-accentSoft">Grid video player</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Multi-source playback wall</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-slate-900 transition hover:brightness-105">
            + Add Video
          </button>
          <button type="button" onClick={onPlayAll} className={buttonClassName}>Play All</button>
          <button type="button" onClick={onPauseAll} className={buttonClassName}>Pause All</button>
          <button type="button" onClick={() => onMuteAll(true)} className={buttonClassName}>Mute All</button>
          <button type="button" onClick={() => onMuteAll(false)} className={buttonClassName}>Unmute All</button>
          <button type="button" onClick={onSyncAll} className={buttonClassName}>Sync Playback</button>
          <button type="button" onClick={onScreenshotAll} className={buttonClassName}>Screenshot All</button>
          <button type="button" onClick={onSavePreset} className={buttonClassName}>Save Preset</button>
          <button type="button" onClick={onImportPreset} className={buttonClassName}>Import Preset</button>
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="border-t border-border/60 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-slate-200"
              >
                <button type="button" onClick={() => onLoadPreset(preset)} className="hover:text-white">
                  {preset.name}
                </button>
                <button type="button" onClick={() => onExportPreset(preset)} className="text-xs text-slate-400 transition hover:text-white">
                  Export
                </button>
                <button type="button" onClick={() => onDeletePreset(preset.id)} className="text-xs text-rose-300 transition hover:text-rose-200">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
