describe('PlaylistManager.sortAndApplyMoves (dryRun vs live, in-memory)', () => {
  let playlistManager: PlaylistManager;
  let mockConfig: PlaylistConfig;
  let playlist: LocalPlaylist;
  let items: LocalPlaylistItem[];
  let getLogger: any;

  beforeEach(() => {
    mockConfig = { playlists: [{ id: 'PLMOCK', title: 'Mock Playlist', keywords: [] }] };
    playlistManager = new PlaylistManager({} as any, mockConfig);
    playlistManager.writePlaylistCache = false;
    playlistManager.doYoutubeApiCalls = false;
    // Unsorted items
    items = [
      { position: 2, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
      { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
      { position: 1, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
    ];
    playlist = {
      id: 'PLMOCK',
      title: 'Mock Playlist',
      description: '',
      privacyStatus: 'public',
      itemCount: items.length,
      items: items.map(i => ({ ...i })),
    };
    getLogger = () => ({
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    });
  });

  it('produces the same in-memory playlist order and logs in dryRun and live mode', async () => {
    // Clone playlist for dryRun and live
    const dryRunCache = JSON.parse(JSON.stringify(playlist));
    const liveCache = JSON.parse(JSON.stringify(playlist));

    // Dry run
    const dryRunResult = await playlistManager.sortAndApplyMoves({
      playlistCache: dryRunCache,
      sortField: 'date',
      dryRun: true,
      getLogger: getLogger,
    });

    // Live (no API, no cache write)
    const liveResult = await playlistManager.sortAndApplyMoves({
      playlistCache: liveCache,
      sortField: 'date',
      dryRun: false,
      getLogger: getLogger,
    });

    // The resulting in-memory playlist order should be the same
    expect(dryRunCache.items.map(i => i.videoId)).toEqual(liveCache.items.map(i => i.videoId));
    // The logs should be the same (except for possible differences in applied count)
    expect(dryRunResult.moves).toEqual(liveResult.moves);
    expect(dryRunResult.resultOrder).toEqual(liveResult.resultOrder);
    expect(dryRunResult.desiredOrder).toEqual(liveResult.desiredOrder);
    // The log messages should be the same except for applied count
    const logDry = dryRunResult.log.map(l => l.replace(/applied: \d+/, 'applied: X'));
    const logLive = liveResult.log.map(l => l.replace(/applied: \d+/, 'applied: X'));
    expect(logDry).toEqual(logLive);
  });
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs-extra';
import { PlaylistManager } from '../scripts/manage-playlists';
import { LocalPlaylist, LocalPlaylistItem, PlaylistConfig } from '../src/types/api-types';
import { exportPlaylistItemsToCsv } from '../scripts/manage-playlists';
import path from 'path';

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

describe('Playlist CSV before/after order', () => {
  const tmpBefore = path.join(__dirname, 'tmp-csv-before.csv');
  const tmpAfter = path.join(__dirname, 'tmp-csv-after.csv');
  const videoDbPath = path.join(__dirname, 'mock-videos-csv.json');

  const playlistItems: LocalPlaylistItem[] = [
    { position: 2, videoId: 'c', title: 'C', publishedAt: '2022-01-03T00:00:00Z' },
    { position: 0, videoId: 'a', title: 'A', publishedAt: '2022-01-01T00:00:00Z' },
    { position: 1, videoId: 'b', title: 'B', publishedAt: '2022-01-02T00:00:00Z' },
  ];
  const videoDb = [
    { id: 'a', privacyStatus: 'public', recordingDate: '2022-01-01T00:00:00Z', publishedAt: '2022-01-01T00:00:00Z', lastUpdated: '2022-01-05T00:00:00Z' },
    { id: 'b', privacyStatus: 'private', recordingDate: '', publishedAt: '2022-01-02T00:00:00Z', lastUpdated: '2022-01-06T00:00:00Z' },
    { id: 'c', privacyStatus: 'unlisted', recordingDate: '', publishedAt: '2022-01-03T00:00:00Z', lastUpdated: '2022-01-07T00:00:00Z' },
  ];

  beforeEach(async () => {
    await fs.writeJson(videoDbPath, videoDb);
  });
  afterEach(async () => {
    await fs.remove(tmpBefore);
    await fs.remove(tmpAfter);
    await fs.remove(videoDbPath);
  });

  it('exports before and after CSVs with correct order', async () => {
    // Export before (original order)
    await exportPlaylistItemsToCsv(playlistItems, tmpBefore, videoDbPath);
    // Export after (sorted by publishedAt ascending)
    const sorted = [...playlistItems].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    await exportPlaylistItemsToCsv(sorted, tmpAfter, videoDbPath);

    const csvBefore = await fs.readFile(tmpBefore, 'utf8');
    const csvAfter = await fs.readFile(tmpAfter, 'utf8');
    // Helper to extract videoIds in order from CSV
    const getOrder = (csv: string) => csv.split('\n').slice(1).filter(Boolean).map(line => line.split(',')[1].replace(/"/g, ''));
    const beforeOrder = getOrder(csvBefore);
    const afterOrder = getOrder(csvAfter);
    // The before order should match the original playlistItems order
    expect(beforeOrder).toEqual(['c', 'a', 'b']);
    // The after order should be sorted by publishedAt
    expect(afterOrder).toEqual(['a', 'b', 'c']);
  });
}); 