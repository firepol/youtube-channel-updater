import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from '../scripts/manage-playlists';
import { LocalPlaylist, LocalPlaylistItem, PlaylistConfig } from '../src/types/api-types';
import fs from 'fs-extra';
import path from 'path';

function createMockPlaylist(items: LocalPlaylistItem[]): LocalPlaylist {
  return {
    id: 'PLMOCK',
    title: 'Mock Playlist',
    description: 'A test playlist',
    privacyStatus: 'public',
    itemCount: items.length,
    items,
  };
}

describe('PlaylistManager.removeDuplicatesFromPlaylist', () => {
  let playlistManager: PlaylistManager;
  let mockConfig: PlaylistConfig;

  beforeEach(() => {
    mockConfig = { playlists: [{ id: 'PLMOCK', title: 'Mock Playlist', keywords: [] }] };
    playlistManager = new PlaylistManager({} as any, mockConfig);
  });

  it('removes duplicates, keeps first occurrence', () => {
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 1, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
      { position: 2, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' }, // duplicate
      { position: 3, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
      { position: 4, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' }, // duplicate
    ]);
    const { newItems, removed } = playlistManager.removeDuplicatesFromPlaylist(playlist);
    expect(newItems.map(i => i.videoId)).toEqual(['a', 'b', 'c']);
    expect(removed).toEqual([
      { position: 2, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 4, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
    ]);
  });

  it('does nothing if no duplicates', () => {
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 1, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
      { position: 2, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
    ]);
    const { newItems, removed } = playlistManager.removeDuplicatesFromPlaylist(playlist);
    expect(newItems.map(i => i.videoId)).toEqual(['a', 'b', 'c']);
    expect(removed).toEqual([]);
  });

  it('handles empty playlist', () => {
    const playlist = createMockPlaylist([]);
    const { newItems, removed } = playlistManager.removeDuplicatesFromPlaylist(playlist);
    expect(newItems).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('removes all but first if all are duplicates', () => {
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 1, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 2, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
    ]);
    const { newItems, removed } = playlistManager.removeDuplicatesFromPlaylist(playlist);
    expect(newItems.map(i => i.videoId)).toEqual(['a']);
    expect(removed.length).toBe(2);
  });
});

// === CSV Export Utility Test ===
import { exportPlaylistItemsToCsv } from '../scripts/manage-playlists';
describe('exportPlaylistItemsToCsv', () => {
  const tmp = path.join(__dirname, 'tmp-csv-test.csv');
  const videoDbPath = path.join(__dirname, 'mock-videos.json');
  const playlistItems: LocalPlaylistItem[] = [
    { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
    { position: 1, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
  ];
  const videoDb = [
    { id: 'a', privacyStatus: 'public', recordingDate: '2022-01-01T00:00:00Z', publishedAt: '2022-01-01T00:00:00Z', lastUpdated: '2022-01-05T00:00:00Z' },
    { id: 'b', privacyStatus: 'private', recordingDate: '', publishedAt: '2022-01-02T00:00:00Z', lastUpdated: '2022-01-06T00:00:00Z' },
  ];

  beforeEach(async () => {
    await fs.writeJson(videoDbPath, videoDb);
  });
  afterEach(async () => {
    await fs.remove(tmp);
    await fs.remove(videoDbPath);
  });

  it('exports playlist items to CSV with correct headers and data', async () => {
    await exportPlaylistItemsToCsv(playlistItems, tmp, videoDbPath);
    const csv = await fs.readFile(tmp, 'utf8');
    expect(csv).toContain('position');
    expect(csv).toContain('videoId');
    expect(csv).toContain('title');
    expect(csv).toContain('privacyStatus');
    expect(csv).toContain('recordingDate');
    expect(csv).toContain('publishedAt');
    expect(csv).toContain('lastUpdated');
    expect(csv).toContain('A');
    expect(csv).toContain('B');
    expect(csv).toContain('public');
    expect(csv).toContain('private');
    expect(csv).toContain('2022-01-01T00:00:00Z');
    expect(csv).toContain('2022-01-02T00:00:00Z');
    expect(csv).toContain('2022-01-05T00:00:00Z');
    expect(csv).toContain('2022-01-06T00:00:00Z');
  });
}); 