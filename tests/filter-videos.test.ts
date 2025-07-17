import { describe, it, expect } from 'vitest';
import { VideoFilter, FilterRule } from '../scripts/filter-videos';

// Minimal valid LocalVideo object
function makeVideo(partial: Partial<any>): any {
  return {
    id: '',
    title: '',
    description: '',
    publishedAt: '2025-01-01T00:00:00Z',
    categoryId: '20',
    privacyStatus: 'public',
    madeForKids: false,
    license: 'creativeCommon',
    uploadStatus: 'processed',
    embeddable: true,
    publicStatsViewable: true,
    definition: 'hd',
    caption: 'false',
    defaultAudioLanguage: 'en-US',
    statistics: { viewCount: '0', likeCount: '0', dislikeCount: '0', favoriteCount: '0', commentCount: '0' },
    lastUpdated: '2025-01-01T00:00:00Z',
    ...partial
  };
}

// Mock VideoFilter with in-memory videos and no config loading
class TestVideoFilter extends VideoFilter {
  constructor(videos: any[]) {
    super();
    // @ts-ignore
    this.videos = videos;
    // @ts-ignore
    this.logger = { info: () => {}, error: () => {}, success: () => {} };
    // @ts-ignore
    this.config = { app: { verbose: false, logLevel: 'info' }, paths: { logsDir: '.', videosDb: '' } };
  }
  async initialize() { /* no-op */ }
}

describe('VideoFilter', () => {
  it('should filter videos where recordingDate is missing (has_recording_date: false)', async () => {
    const videos = [
      makeVideo({ id: '1', title: 'Video 1', recordingDate: '2025-07-01T00:00:00Z' }),
      makeVideo({ id: '2', title: 'Video 2' }), // missing property
      makeVideo({ id: '3', title: 'Video 3', recordingDate: undefined }),
      makeVideo({ id: '4', title: 'Video 4', recordingDate: null }),
      makeVideo({ id: '5', title: 'Video 5', recordingDate: '' }),
      makeVideo({ id: '6', title: 'Video 6', recordingDate: '2025-07-02T00:00:00Z' })
    ];
    const filter: FilterRule = { type: 'has_recording_date', value: false };
    const videoFilter = new TestVideoFilter(videos);
    const result = videoFilter.applyFilters(videos, [filter]);
    const resultIds = result.map(v => v.id);
    expect(resultIds).toEqual(['2', '3', '4', '5']);
  });
}); 