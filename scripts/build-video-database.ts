#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { LocalVideo, YouTubeVideo } from '../src/types/api-types';

interface VideoDatabaseState {
  videos: LocalVideo[];
  lastPageToken?: string | undefined;
  totalProcessed: number;
  lastUpdated: string;
}

class VideoDatabaseBuilder {
  private youtubeClient!: YouTubeClient;
  private config: any;
  private logger: any;
  private stateFile: string;
  private outputFile: string;

  constructor() {
    this.stateFile = 'data/video-db-state.json';
    this.outputFile = 'data/videos.json';
  }

  /**
   * Initialize the builder
   */
  async initialize(): Promise<void> {
    try {
      // Initialize logger first with default settings
      this.logger = initializeLogger({
        verbose: process.env.VERBOSE === 'true',
        logLevel: LogLevel.INFO,
        logsDir: 'logs'
      });

      // Load configuration
      const configLoader = new ConfigLoader();
      this.config = await configLoader.loadConfig();

      // Re-initialize logger with config settings
      this.logger = initializeLogger({
        verbose: this.config.app.verbose,
        logLevel: this.config.app.logLevel as LogLevel,
        logsDir: this.config.paths.logsDir
      });

      // Initialize YouTube client
      this.youtubeClient = new YouTubeClient(
        this.config.youtube.apiKey,
        this.config.youtube.clientId,
        this.config.youtube.clientSecret,
        this.config.youtube.channelId,
        this.config.rateLimiting.maxRetries,
        this.config.rateLimiting.retryDelayMs,
        this.config.rateLimiting.apiCallDelayMs
      );

      // Load OAuth tokens if available
      const tokensLoaded = await this.youtubeClient.loadTokens();
      if (!tokensLoaded) {
        this.logger.warning('OAuth tokens not found. Some operations may fail.');
      }

      // Ensure data directory exists
      await fs.ensureDir(path.dirname(this.outputFile));

      this.logger.info('Video database builder initialized');
    } catch (error) {
      console.error('Failed to initialize video database builder:', error);
      process.exit(1);
    }
  }

  /**
   * Load existing state or create new state
   */
  private async loadState(): Promise<VideoDatabaseState> {
    try {
      // First, try to load existing videos from the actual database file
      if (await fs.pathExists(this.outputFile)) {
        const existingVideos = await fs.readJson(this.outputFile) as LocalVideo[];
        this.logger.info(`Loaded ${existingVideos.length} existing videos from database`);
        return {
          videos: existingVideos,
          totalProcessed: existingVideos.length,
          lastUpdated: new Date().toISOString()
        };
      }
      
      // If no database file exists, try to load from state file (for interrupted builds)
      if (await fs.pathExists(this.stateFile)) {
        const state = await fs.readJson(this.stateFile);
        this.logger.info(`Resuming from state: ${state.totalProcessed} videos processed`);
        return state;
      }
    } catch (error) {
      this.logger.warning('Failed to load existing data, starting fresh');
    }

    return {
      videos: [],
      totalProcessed: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Save current state
   */
  private async saveState(state: VideoDatabaseState): Promise<void> {
    try {
      await fs.writeJson(this.stateFile, state, { spaces: 2 });
    } catch (error) {
      this.logger.error('Failed to save state file', error as Error);
    }
  }

  /**
   * Save videos to output file
   */
  private async saveVideos(videos: LocalVideo[]): Promise<void> {
    try {
      // Sort videos: known dates first (chronologically), then unknown dates (newest first)
      const sortedVideos = videos.sort((a, b) => {
        if (a.datetime && b.datetime) {
          return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
        }
        if (a.datetime && !b.datetime) return -1;
        if (!a.datetime && b.datetime) return 1;
        // For videos without extracted dates, sort by lastUpdated (newest first)
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      });

      await fs.writeJson(this.outputFile, sortedVideos, { spaces: 2 });
      this.logger.success(`Saved ${sortedVideos.length} videos to ${this.outputFile}`);
    } catch (error) {
      this.logger.error('Failed to save videos', error as Error);
      throw error;
    }
  }

  /**
   * Extract datetime from video title or description
   */
  private extractDatetime(video: YouTubeVideo): string | undefined {
    // Try to extract from title first
    if (video.snippet?.title) {
      const titleMatch = video.snippet.title.match(/(\d{4})[.\s-](\d{2})[.\s-](\d{2})/);
      if (titleMatch) {
        return `${titleMatch[1]}-${titleMatch[2]}-${titleMatch[3]}`;
      }
    }

    // Try to extract from description
    if (video.snippet?.description) {
      const descMatch = video.snippet.description.match(/(\d{4})[.\s-](\d{2})[.\s-](\d{2})/);
      if (descMatch) {
        return `${descMatch[1]}-${descMatch[2]}-${descMatch[3]}`;
      }
    }

    return undefined;
  }

  /**
   * Convert YouTube video to local video format
   */
  private convertToLocalVideo(video: YouTubeVideo): LocalVideo {
    return {
      id: video.id,
      title: video.snippet?.title || '',
      description: video.snippet?.description || '',
      publishedAt: video.snippet?.publishedAt || '',
      datetime: this.extractDatetime(video),
      tags: video.snippet?.tags || [],
      categoryId: video.snippet?.categoryId || '20',
      privacyStatus: video.status?.privacyStatus || 'private',
      madeForKids: video.status?.madeForKids || false,
      license: video.status?.license || 'youtube',
      recordingDate: video.recordingDate,
      // Additional fields for filtering
      uploadStatus: video.status?.uploadStatus,
      processingStatus: video.processingDetails?.processingStatus,
      embeddable: video.status?.embeddable,
      publicStatsViewable: video.status?.publicStatsViewable,
      definition: video.contentDetails?.definition,
      caption: video.contentDetails?.caption,
      defaultLanguage: video.snippet?.defaultLanguage,
      defaultAudioLanguage: video.snippet?.defaultAudioLanguage,
      statistics: video.statistics,
      processingErrors: video.suggestions?.processingErrors,
      // Metadata tracking
      lastFetched: new Date().toISOString(),
      lastUpdated: video.snippet?.publishedAt || '' // Use publishedAt as it reflects when the video was uploaded/created
    };
  }

  /**
   * Check if video already exists in database
   */
  private isVideoDuplicate(videoId: string, existingVideos: LocalVideo[]): boolean {
    return existingVideos.some(v => v.id === videoId);
  }

  /**
   * Check if an existing video has changes compared to YouTube data
   */
  private hasVideoChanges(existingVideo: LocalVideo, youtubeVideo: YouTubeVideo): boolean {
    // Check for changes in key fields (excluding statistics as they change frequently)
    const titleChanged = existingVideo.title !== (youtubeVideo.snippet?.title || '');
    const descriptionChanged = existingVideo.description !== (youtubeVideo.snippet?.description || '');
    const tagsChanged = JSON.stringify(existingVideo.tags || []) !== JSON.stringify(youtubeVideo.snippet?.tags || []);
    const privacyStatusChanged = existingVideo.privacyStatus !== (youtubeVideo.status?.privacyStatus || 'private');
    const madeForKidsChanged = existingVideo.madeForKids !== (youtubeVideo.status?.madeForKids || false);

    return titleChanged || descriptionChanged || tagsChanged || privacyStatusChanged || madeForKidsChanged;
  }

  /**
   * Update existing video with new data from YouTube
   */
  private updateExistingVideo(existingVideo: LocalVideo, youtubeVideo: YouTubeVideo): LocalVideo {
    return {
      ...existingVideo,
      title: youtubeVideo.snippet?.title || existingVideo.title,
      description: youtubeVideo.snippet?.description || existingVideo.description,
      tags: youtubeVideo.snippet?.tags || existingVideo.tags,
      privacyStatus: youtubeVideo.status?.privacyStatus || existingVideo.privacyStatus,
      madeForKids: youtubeVideo.status?.madeForKids || existingVideo.madeForKids,
      statistics: youtubeVideo.statistics || existingVideo.statistics,
      lastFetched: new Date().toISOString(),
      // Keep existing lastUpdated as it represents when YouTube last updated this video
    };
  }

  /**
   * Build the video database
   */
  async buildDatabase(): Promise<void> {
    try {
      this.logger.info('Starting video database build...');

      // Load existing videos from database
      let existingVideos: LocalVideo[] = [];
      if (await fs.pathExists(this.outputFile)) {
        existingVideos = await fs.readJson(this.outputFile) as LocalVideo[];
        this.logger.info(`Loaded ${existingVideos.length} existing videos from database`);
      }

      // Load existing state
      const state = await this.loadState();
      let currentVideos = [...existingVideos]; // Start with existing videos
      let newVideos: LocalVideo[] = []; // Track only new videos
      let totalUpdatedVideos = 0; // Track total updated videos
      let pageToken = state.lastPageToken;
      let totalProcessed = state.totalProcessed;

      // Get channel info for logging
      try {
        const channel = await this.youtubeClient.getChannel();
        this.logger.info(`Building database for channel: ${channel.title}`);
      } catch (error) {
        this.logger.warning('Could not fetch channel info, continuing...');
      }

      let pageCount = 0;
      const maxResults = 50; // YouTube API max per request

      do {
        pageCount++;
        this.logger.info(`Fetching page ${pageCount} (${totalProcessed} videos processed so far)`);

        try {
          // Fetch videos from current page (including drafts)
          const response = await this.youtubeClient.getAllVideos(pageToken, maxResults);
          
          if (!response.items || response.items.length === 0) {
            this.logger.info('No more videos found');
            break;
          }

          // Process videos from this page
          let newVideosCount = 0;
          let updatedVideosCount = 0;
          let foundDuplicate = false;
          let hasChanges = false;
          let oldestVideoChanged = false;
          
          for (const video of response.items) {
            const existingVideoIndex = currentVideos.findIndex(v => v.id === video.id);
            
            if (existingVideoIndex !== -1) {
              // Video exists, check for changes
              const existingVideo = currentVideos[existingVideoIndex];
              if (this.hasVideoChanges(existingVideo, video)) {
                // Update existing video with new data
                currentVideos[existingVideoIndex] = this.updateExistingVideo(existingVideo, video);
                updatedVideosCount++;
                totalUpdatedVideos++;
                hasChanges = true;
                this.logger.info(`Updated video ${video.id} (${video.snippet?.title})`);
                
                // Check if this is the oldest video on this page (last in the array)
                if (video === response.items[response.items.length - 1]) {
                  oldestVideoChanged = true;
                  this.logger.info(`Oldest video on page ${pageCount} has changes, will check next page`);
                }
              }
              foundDuplicate = true;
            } else {
              // New video
              const localVideo = this.convertToLocalVideo(video);
              currentVideos.push(localVideo);
              newVideos.push(localVideo);
              newVideosCount++;
              totalProcessed++;
            }
          }

          this.logger.info(`Page ${pageCount}: Found ${response.items.length} videos, ${newVideosCount} new, ${updatedVideosCount} updated`);
          
          // Smart page fetching logic:
          // - If we found new videos, continue to next page
          // - If we found changes in the oldest video of this page, continue to next page (changes might cascade)
          // - If we found only changes in newer videos, stop here (no need to check older videos)
          if (newVideosCount === 0 && !oldestVideoChanged) {
            this.logger.info('No new videos and no changes in oldest video, stopping incremental update');
            break;
          }

          // Update progress
          this.logger.progress(totalProcessed, totalProcessed + (response.pageInfo.totalResults - totalProcessed), 'Videos Processed');

          // Save state after each page
          await this.saveState({
            videos: currentVideos,
            lastPageToken: response.nextPageToken,
            totalProcessed,
            lastUpdated: new Date().toISOString()
          });

          // Check rate limits
          const rateLimit = this.youtubeClient.getRateLimitInfo();
          const remaining = rateLimit.quotaLimit - rateLimit.quotaUsed;
          if (remaining < 100) {
            this.logger.warning(`Rate limit approaching: ${remaining} units remaining`);
          }

          // Move to next page
          pageToken = response.nextPageToken;

        } catch (error) {
          this.logger.error(`Failed to fetch page ${pageCount}`, error as Error);
          
          // If it's a rate limit error, stop immediately
          if (error instanceof Error && error.message.includes('rate limit')) {
            this.logger.error('Rate limit exceeded, stopping. You can resume later.');
            break;
          }
          
          // For other errors, continue to next page
          continue;
        }

      } while (pageToken);

      // Save final database with all videos (existing + new)
      await this.saveVideos(currentVideos);

      // Clean up state file
      try {
        await fs.remove(this.stateFile);
        this.logger.info('State file cleaned up');
      } catch (error) {
        this.logger.warning('Failed to clean up state file');
      }

      this.logger.success(`Video database build completed! Total videos: ${currentVideos.length} (added ${newVideos.length} new, updated ${totalUpdatedVideos})`);
      
      // Log statistics
      const withDates = currentVideos.filter(v => v.datetime).length;
      const withoutDates = currentVideos.length - withDates;
      this.logger.info(`Statistics: ${withDates} videos with dates, ${withoutDates} videos without dates`);

    } catch (error) {
      this.logger.error('Failed to build video database', error as Error);
      throw error;
    }
  }

  /**
   * Resume interrupted build
   */
  async resume(): Promise<void> {
    this.logger.info('Resuming interrupted video database build...');
    await this.buildDatabase();
  }

  /**
   * Clean up and start fresh
   */
  async clean(): Promise<void> {
    try {
      await fs.remove(this.outputFile);
      await fs.remove(this.stateFile);
      this.logger.success('Cleaned up video database files');
    } catch (error) {
      this.logger.error('Failed to clean up files', error as Error);
    }
  }
}

// Main execution
async function main() {
  const builder = new VideoDatabaseBuilder();
  
  try {
    await builder.initialize();

    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'resume':
        await builder.resume();
        break;
      case 'clean':
        await builder.clean();
        break;
      case 'build':
      default:
        await builder.buildDatabase();
        break;
    }

  } catch (error) {
    console.error('Video database build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
} 