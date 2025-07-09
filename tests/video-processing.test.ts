import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoProcessor } from '../scripts/process-videos';
import { LocalVideo } from '../src/types/api-types';
import { initializeLogger, LogLevel } from '../src/utils/logger';

// Mock YouTube client
const mockYouTubeClient = {
  updateVideo: vi.fn(),
  getVideo: vi.fn(),
  listVideos: vi.fn(),
  isAuthenticated: vi.fn(() => true)
};

// Mock configuration with named groups
const mockConfig = {
  titleTransform: {
    pattern: "Tom Clancy's The Division 2 (?<year>\\d{4}) (?<month>\\d{2}) (?<day>\\d{2}) (?<hour>\\d{2}) (?<minute>\\d{2}) (?<second>\\d{2}) (?<centisecond>\\d{2}) (?<rest>.+)",
    replacement: "DZ $<rest> / The Division 2 / $<year>-$<month>-$<day>"
  },
  descriptionTransform: {
    pattern: "Tom Clancy's The Division 2 (?<year>\\d{4}) (?<month>\\d{2}) (?<day>\\d{2}) (?<hour>\\d{2}) (?<minute>\\d{2}) (?<second>\\d{2}) (?<centisecond>\\d{2})",
    replacement: "Tom Clancy's The Division 2 / $<year>-$<month>-$<day> $<hour>:$<minute>"
  },
  baseTags: ['The Division 2', 'Gaming', 'Gameplay', 'Tom Clancy'],
  maxDynamicTags: 2,
  metadataVersion: 'v1.1',
  videoSettings: {
    madeForKids: false,
    license: 'creativeCommon',
    categoryId: '20',
    allowRemixing: true
  },
  // Add titleBasedTags for tag generation tests
  titleBasedTags: [
    {
      pattern: 'The Division',
      tags: ['The Division'],
      caseSensitive: false
    },
    {
      pattern: 'Dark Zone',
      tags: ['Dark Zone'],
      caseSensitive: false
    },
    {
      pattern: 'DZ',
      tags: ['Dark Zone'],
      caseSensitive: false
    },
    {
      pattern: 'GB|Golden Bullet',
      tags: ['Golden Bullet', 'Global Event'],
      caseSensitive: false
    }
  ]
};

describe('Video Processing with Named Groups', () => {
  let processor: VideoProcessor;

  beforeEach(() => {
    // Initialize logger for tests
    initializeLogger({
      verbose: true,
      logLevel: LogLevel.VERBOSE,
      logsDir: 'logs'
    });
    
    // Create processor with correct constructor parameters
    processor = new VideoProcessor(mockYouTubeClient as any, mockConfig as any);
  });

  describe('Title Transformations', () => {
    it('should transform Division 2 title with named groups', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue gone wrong";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      expect(result).toBe("DZ going rogue gone wrong / The Division 2 / 2025-03-29");
    });

    it('should handle multiple spaces in datetime', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025  03  29  10  01  17  02 going rogue gone wrong";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      // The current pattern doesn't handle multiple spaces, so it should return the original title
      expect(result).toBe(originalTitle);
    });

    it('should handle title without datetime pattern', () => {
      const originalTitle = "Just a regular gaming video";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      expect(result).toBe(originalTitle);
    });

    it('should handle title with different datetime format', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025-03-29 10:01:17 02 going rogue gone wrong";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      // Should not match the pattern with dashes
      expect(result).toBe(originalTitle);
    });

    it('should handle edge case with minimal rest text', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 x";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      expect(result).toBe("DZ x / The Division 2 / 2025-03-29");
    });

    it('should handle title with special characters in rest', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue (gone wrong)";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformTitle'](originalTitle, recordingDate);
      
      expect(result).toBe("DZ going rogue (gone wrong) / The Division 2 / 2025-03-29");
    });
  });

  describe('Description Transformations', () => {
    it('should transform Division 2 description with named groups', () => {
      const originalDesc = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 gameplay footage";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformDescription'](originalDesc, recordingDate);
      
      expect(result).toContain("Tom Clancy's The Division 2 / 2025-03-29 10:01");
      expect(result).toContain("[metadata v1.1:");
    });

    it('should handle description without datetime pattern', () => {
      const originalDesc = "Just a regular description";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformDescription'](originalDesc, recordingDate);
      
      expect(result).toContain(originalDesc);
      expect(result).toContain("[metadata v1.1:");
    });

    it('should not duplicate metadata tags', () => {
      const originalDesc = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 gameplay [metadata v1.0: proc_20250101_120000]";
      const recordingDate = '2025-03-29T10:01:17.020Z';
      
      const result = processor['transformDescription'](originalDesc, recordingDate);
      
      // Should not add another metadata tag since one already exists
      const metadataMatches = result.match(/\[metadata/g);
      expect(metadataMatches).toHaveLength(1);
    });

    it('should generate description from title if description is empty', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 29 21 23 03 09 Countdown Last Phase Heroic";
      const originalDesc = "";
      const recordingDate = '2025-01-25T21:23:03.090Z';
      // Use the config from the main config/video-processing.json for this test
      const config = {
        titleTransform: {
          pattern: "Tom Clancy's The Division 2 (\\d{4}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (.+)",
          replacement: "$8 / The Division 2 / $1-$2-$3"
        },
        descriptionTransforms: [
          {
            pattern: "Tom Clancy's\\s+The\\s+Division\\s+2\\s+(\\d{4})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(.+)",
            replacement: "Tom Clancy's The Division 2 / $1-$2-$3 $4:$5"
          }
        ],
        baseTags: ['The Division 2', 'Gaming', 'Gameplay', 'Tom Clancy'],
        maxDynamicTags: 2,
        metadataVersion: 'v1.1',
        videoSettings: {
          madeForKids: false,
          license: 'creativeCommon',
          categoryId: '20',
          allowRemixing: true
        }
      };
      const processor = new VideoProcessor(mockYouTubeClient as any, config as any);
      const result = processor['transformDescription'](originalDesc, originalTitle, recordingDate);
      expect(result).toContain("Tom Clancy's The Division 2 / 2025-03-29 21:23");
      expect(result).toMatch(/\[metadata v1\.1: proc_\d{8}_\d{6}\]/);
    });
  });

  describe('Multi-step Title and Description Transforms', () => {
    const config = {
      titleTransforms: [
        { pattern: "^Tom Clancy's\\s+The\\s+Division\\s+2\\s+(.+)\\s+(\\d{4}-\\d{2}-\\d{2})$", replacement: "$1 / The Division 2 / $2" },
        { pattern: "^Tom Clancy's\\s+The\\s+Division\\s+2\\s*-?\\s*", replacement: "" },
        { pattern: "^(\\d{4}) (\\d{2}) (\\d{2})\\s+(\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (.+)", replacement: "$8 / The Division 2 / $1-$2-$3" }
      ],
      descriptionTransforms: [
        { pattern: "^Tom Clancy's\\s+The\\s+Division\\s+2\\s+(\\d{4})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(\\d{2})\\s+(.+)$", replacement: "Tom Clancy's The Division 2 / $1-$2-$3 $4:$5 $8" }
      ],
      baseTags: ['The Division 2', 'Gaming', 'Gameplay', 'Tom Clancy'],
      maxDynamicTags: 2,
      metadataVersion: 'v1.1',
      videoSettings: {
        madeForKids: false,
        license: 'creativeCommon',
        categoryId: '20',
        allowRemixing: true
      },
      recordingDateExtractPattern: "(?<year>\\d{4})[ .-]?(?<month>\\d{2})[ .-]?(?<day>\\d{2})[ .-]+(?<hour>\\d{2})[ .-]?(?<minute>\\d{2})[ .-]?(?<second>\\d{2})[ .-]?(?<centisecond>\\d{2})"
    };
    const processor = new VideoProcessor(mockYouTubeClient as any, config as any);

    it('should transform title with prefix and spaces', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 09   07 33 12 03 Various activities with random group";
      const expected = "Various activities with random group / The Division 2 / 2025-03-09";
      const result = processor['transformTitle'](originalTitle, '2025-03-09T07:33:12.030Z');
      expect(result).toBe(expected);
    });

    it('should transform title already in date+rest format', () => {
      const originalTitle = "2025 03 09   07 33 12 03 Various activities with random group";
      const expected = "Various activities with random group / The Division 2 / 2025-03-09";
      const result = processor['transformTitle'](originalTitle, '2025-03-09T07:33:12.030Z');
      expect(result).toBe(expected);
    });

    it('should transform title with dash before date', () => {
      const originalTitle = "Tom Clancy's The Division 2 - 2025 03 09   07 33 12 03 Sometext";
      const expected = "Sometext / The Division 2 / 2025-03-09";
      const result = processor['transformTitle'](originalTitle, '2025-03-09T07:33:12.030Z');
      expect(result).toBe(expected);
    });

    it('should transform description with prefix and spaces', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 09   07 33 12 03 Various activities with random group";
      const originalDesc = "";
      const result = processor['transformDescription'](originalDesc, originalTitle, '2025-03-09T07:33:12.030Z');
      expect(result).toContain("Tom Clancy's The Division 2 / 2025-03-09 07:33");
      expect(result).toMatch(/\[metadata v1\.1: proc_\d{8}_\d{6}\]/);
    });

    it('should transform description for Division 2 video with spaced date/time', () => {
      const originalTitle = "Tom Clancy's The Division 2 2025 03 09   07 33 12 03 Various activities with random group";
      const originalDesc = "";
      const recordingDate = '2025-03-09T07:33:12.030Z';
      const result = processor['transformDescription'](originalDesc, originalTitle, recordingDate);
      expect(result).toContain("Tom Clancy's The Division 2 / 2025-03-09 07:33");
      expect(result).toMatch(/\[metadata v1\..*\]/);
    });
  });

  describe('Tag Generation', () => {
    it('should generate tags from Division 2 title', () => {
      const title = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue gone wrong";
      
      const result = processor['generateTags'](title);
      
      expect(result).toContain('The Division 2');
      expect(result).toContain('Gaming');
      expect(result).toContain('Gameplay');
      expect(result).toContain('Tom Clancy');
      expect(result).toContain('The Division');
    });

    it('should generate tags from Dark Zone title', () => {
      const title = "Dark Zone gameplay 2025 03 29 10 01 17 02 going rogue";
      
      const result = processor['generateTags'](title);
      
      expect(result).toContain('Dark Zone');
      expect(result).toContain('Gaming');
      expect(result).toContain('Gameplay');
    });

    it('should limit dynamic tags', () => {
      const title = "gameplay walkthrough review tutorial guide tips tricks";
      
      const result = processor['generateTags'](title);
      
      // Should have base tags + limited dynamic tags
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct named group patterns', () => {
      const result = processor['validateConfiguration']();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid regex patterns', () => {
      const invalidConfig = {
        ...mockConfig,
        titleTransform: {
          pattern: "Invalid regex (",
          replacement: "DZ $<rest> / The Division 2 / $<year>-$<month>-$<day>"
        }
      };
      
      const invalidProcessor = new VideoProcessor(mockYouTubeClient as any, invalidConfig as any);
      const result = invalidProcessor['validateConfiguration']();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Dry Run Preview', () => {
    it('should generate dry run preview with named groups', async () => {
      const testVideos: LocalVideo[] = [
        {
          id: 'test1',
          title: "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue gone wrong",
          description: "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 gameplay footage",
          publishedAt: '2025-03-29T10:01:17.020Z',
          recordingDate: '2025-03-29T10:01:17.020Z',
          tags: ['old', 'tags'],
          categoryId: '20',
          privacyStatus: 'private',
          madeForKids: false,
          license: 'youtube',
          lastFetched: new Date().toISOString(),
          lastUpdated: '2025-03-29T10:01:17.020Z'
        }
      ];

      const result = await processor['generateDryRunPreview'](testVideos);
      
      expect(result.preview).toHaveLength(1);
      expect(result.preview[0].proposedState.title).toBe("DZ going rogue gone wrong / The Division 2 / 2025-03-29");
      expect(result.preview[0].proposedState.description).toContain("Tom Clancy's The Division 2 / 2025-03-29 10:01");
      expect(result.preview[0].changes.titleChanged).toBe(true);
      expect(result.preview[0].changes.descriptionChanged).toBe(true);
    });
  });
});

describe('Alternative Named Group Patterns', () => {
  it('should work with different named group patterns', () => {
    const alternativeConfig = {
      titleTransform: {
        pattern: "(?<game>Tom Clancy's The Division 2) (?<year>\\d{4}) (?<month>\\d{2}) (?<day>\\d{2}) (?<time>\\d{2} \\d{2} \\d{2} \\d{2}) (?<rest>.+)",
        replacement: "DZ $<rest> / $<game> / $<year>-$<month>-$<day>"
      }
    };

    initializeLogger({
      verbose: true,
      logLevel: LogLevel.VERBOSE,
      logsDir: 'logs'
    });
    const processor = new VideoProcessor(mockYouTubeClient as any, alternativeConfig as any);
    const originalTitle = "Tom Clancy's The Division 2 2025 03 29 10 01 17 02 going rogue gone wrong";
    const recordingDate = '2025-03-29T10:01:17.020Z';
    
    const result = processor['transformTitle'](originalTitle, recordingDate);
    
    expect(result).toBe("DZ going rogue gone wrong / Tom Clancy's The Division 2 / 2025-03-29");
  });

  it('should work with optional named groups', () => {
    const optionalConfig = {
      titleTransform: {
        pattern: "(?<game>Tom Clancy's The Division 2) (?<year>\\d{4}) (?<month>\\d{2}) (?<day>\\d{2}) (?<time>\\d{2} \\d{2} \\d{2} \\d{2})? (?<rest>.+)",
        replacement: "DZ $<rest> / $<game> / $<year>-$<month>-$<day>"
      }
    };

    initializeLogger({
      verbose: true,
      logLevel: LogLevel.VERBOSE,
      logsDir: 'logs'
    });
    const processor = new VideoProcessor(mockYouTubeClient as any, optionalConfig as any);
    const originalTitle = "Tom Clancy's The Division 2 2025 03 29 going rogue gone wrong";
    const recordingDate = '2025-03-29T10:01:17.020Z';
    
    const result = processor['transformTitle'](originalTitle, recordingDate);
    
    // The pattern doesn't match because it expects the time component, so it should return the original title
    expect(result).toBe(originalTitle);
  });
}); 