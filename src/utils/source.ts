import type { SourceType } from '../shared/types';

export function inferSourceType(value: string): SourceType | null {
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

  if (['.mp4', '.mkv', '.mov', '.avi', '.webm'].some((extension) => lower.endsWith(extension))) {
    return 'local';
  }

  return null;
}
