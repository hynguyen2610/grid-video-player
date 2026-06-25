import { describe, expect, it } from 'vitest';
import { inferSourceType } from './source';

describe('inferSourceType', () => {
  it('detects supported source types', () => {
    expect(inferSourceType('/tmp/video.mp4')).toBe('local');
    expect(inferSourceType('https://example.com/live.m3u8')).toBe('hls');
    expect(inferSourceType('https://example.com/manifest.mpd')).toBe('dash');
    expect(inferSourceType('rtsp://camera.local/live')).toBe('rtsp');
  });

  it('rejects unknown extensions', () => {
    expect(inferSourceType('https://example.com/file.txt')).toBeNull();
  });
});
