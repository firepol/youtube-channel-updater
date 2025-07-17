import { PlaylistDiscoverer } from '../scripts/discover-playlists';
import fs from 'fs-extra';
import path from 'path';

describe('PlaylistDiscoverer.resolvePlaylist', () => {
  const mockConfigPath = path.join(__dirname, 'mock-playlists.json');
  const mockConfig = {
    playlists: [
      { id: 'PL123', title: 'Test Playlist', description: '', keywords: [], visibility: 'public' },
      { id: 'PL456', title: 'Another List', description: '', keywords: [], visibility: 'private' },
    ]
  };

  beforeAll(async () => {
    await fs.writeJson(mockConfigPath, mockConfig);
  });
  afterAll(async () => {
    await fs.remove(mockConfigPath);
  });

  it('resolves by id', async () => {
    const discoverer = new PlaylistDiscoverer();
    const result = await discoverer.resolvePlaylist('PL123', mockConfigPath);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('PL123');
  });

  it('resolves by title (case-insensitive)', async () => {
    const discoverer = new PlaylistDiscoverer();
    const result = await discoverer.resolvePlaylist('test playlist', mockConfigPath);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('PL123');
  });

  it('returns null if not found', async () => {
    const discoverer = new PlaylistDiscoverer();
    const result = await discoverer.resolvePlaylist('Nonexistent', mockConfigPath);
    expect(result).toBeNull();
  });
}); 