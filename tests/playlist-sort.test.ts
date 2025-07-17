import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs-extra';
import { PlaylistManager } from '../scripts/manage-playlists';
import { LocalPlaylist, LocalPlaylistItem, PlaylistConfig } from '../src/types/api-types';

// Helper to create mock playlist data
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

describe('PlaylistManager.sortPlaylistItems', () => {
  let playlistManager: PlaylistManager;
  let mockConfig: PlaylistConfig;
  let readJsonSyncSpy: any;

  beforeEach(() => {
    mockConfig = { playlists: [{ id: 'PLMOCK', title: 'Mock Playlist', keywords: [] }] };
    playlistManager = new PlaylistManager({} as any, mockConfig);
    // Reset spy
    if (readJsonSyncSpy) readJsonSyncSpy.mockRestore();
  });

  it('sorts by recordingDate if present, fallback to publishedAt', () => {
    // Mock video database
    const videoDb = [
      { id: 'a', recordingDate: '2022-01-01T00:00:00Z', publishedAt: '2022-02-01T00:00:00Z' },
      { id: 'b', publishedAt: '2022-01-02T00:00:00Z' }, // no recordingDate
      { id: 'c', recordingDate: '2021-12-31T00:00:00Z', publishedAt: '2022-01-03T00:00:00Z' },
    ];
    readJsonSyncSpy = vi.spyOn(fs, 'readJsonSync').mockReturnValue(videoDb);
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
      { position: 1, videoId: 'a', title: 'A', publishedAt: '2022-02-01T00:00:00Z' },
      { position: 2, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
    ]);
    const sorted = playlistManager.sortPlaylistItems(playlist, 'date');
    // c (2021-12-31), a (2022-01-01), b (2022-01-02)
    expect(sorted[0].videoId).toBe('c');
    expect(sorted[1].videoId).toBe('a');
    expect(sorted[2].videoId).toBe('b');
  });

  it('sorts by publishedAt if recordingDate is missing for all', () => {
    const videoDb = [
      { id: 'a', publishedAt: '2022-02-01T00:00:00Z' },
      { id: 'b', publishedAt: '2022-01-02T00:00:00Z' },
      { id: 'c', publishedAt: '2022-01-03T00:00:00Z' },
    ];
    readJsonSyncSpy = vi.spyOn(fs, 'readJsonSync').mockReturnValue(videoDb);
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
      { position: 1, videoId: 'a', title: 'A', publishedAt: '2022-02-01T00:00:00Z' },
      { position: 2, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
    ]);
    const sorted = playlistManager.sortPlaylistItems(playlist, 'date');
    // b (2022-01-02), c (2022-01-03), a (2022-02-01)
    expect(sorted[0].videoId).toBe('b');
    expect(sorted[1].videoId).toBe('c');
    expect(sorted[2].videoId).toBe('a');
  });

  it('sorts by title alphabetically', () => {
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'b', title: 'Bravo', publishedAt: '2023-01-02T00:00:00Z' },
      { position: 1, videoId: 'a', title: 'Alpha', publishedAt: '2023-01-01T00:00:00Z' },
    ]);
    const sorted = playlistManager.sortPlaylistItems(playlist, 'title');
    expect(sorted[0].title).toBe('Alpha');
    expect(sorted[1].title).toBe('Bravo');
  });

  it('handles empty playlist gracefully', () => {
    const playlist = createMockPlaylist([]);
    const sorted = playlistManager.sortPlaylistItems(playlist, 'date');
    expect(sorted).toEqual([]);
  });

  it('does not throw if videoDb is missing', () => {
    readJsonSyncSpy = vi.spyOn(fs, 'readJsonSync').mockImplementation(() => { throw new Error('not found'); });
    const playlist = createMockPlaylist([
      { position: 0, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
      { position: 1, videoId: 'a', title: 'A', publishedAt: '2022-02-01T00:00:00Z' },
    ]);
    const sorted = playlistManager.sortPlaylistItems(playlist, 'date');
    expect(sorted.length).toBe(2);
    // Should fallback to publishedAt
    expect(sorted[0].videoId).toBe('b');
    expect(sorted[1].videoId).toBe('a');
  });
}); 