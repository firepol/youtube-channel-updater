#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { LocalVideo, LocalPlaylist, LocalPlaylistItem, YouTubePlaylistItem } from '../src/types/api-types';

class PlaylistContentBuilder {
  private youtubeClient!: YouTubeClient;
  private logger: any;
  private playlistsDir: string;
  private videosDbPath: string;
  private videosDb: LocalVideo[] = [];

  constructor() {
    this.playlistsDir = 'data/playlists';
    this.videosDbPath = 'data/videos.json';
  }

  /**
   * Initialize the builder
   */
  async initialize(): Promise<void> {
    try {
      // Ensure playlists directory exists
      await fs.ensureDir(this.playlistsDir);

      // Load basic configuration (without playlist config)
      const configLoader = new ConfigLoader();
      const basicConfig = await configLoader.loadBasicConfig();

      // Initialize logger
      this.logger = initializeLogger({
        verbose: basicConfig.app.verbose,
        logLevel: basicConfig.app.logLevel as LogLevel,
        logsDir: basicConfig.paths.logsDir
      });

      // Initialize YouTube client
      this.youtubeClient = new YouTubeClient(
        basicConfig.youtube.apiKey,
        basicConfig.youtube.clientId,
        basicConfig.youtube.clientSecret,
        basicConfig.youtube.channelId,
        basicConfig.rateLimiting.maxRetries,
        basicConfig.rateLimiting.retryDelayMs,
        basicConfig.rateLimiting.apiCallDelayMs
      );

      // Load OAuth tokens if available
      const tokensLoaded = await this.youtubeClient.loadTokens();
      if (!tokensLoaded) {
        this.logger.warning('OAuth tokens not found. Some operations may fail.');
      }

      // Load video database
      await this.loadVideoDatabase();

      this.logger.info('Playlist content builder initialized');
    } catch (error) {
      console.error('Failed to initialize playlist content builder:', error);
      process.exit(1);
    }
  }

  /**
   * Load video database
   */
  private async loadVideoDatabase(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.videosDbPath))) {
        throw new Error(`Video database not found: ${this.videosDbPath}. Run build-video-database.ts first.`);
      }

      this.videosDb = await fs.readJson(this.videosDbPath);
      this.logger.info(`Loaded ${this.videosDb.length} videos from database`);
    } catch (error) {
      this.logger.error('Failed to load video database', error as Error);
      throw error;
    }
  }

  /**
   * Get video title from local database
   */
  private getVideoTitle(videoId: string): string {
    const video = this.videosDb.find(v => v.id === videoId);
    return video?.title || `Unknown Video (${videoId})`;
  }

  /**
   * Get video published date from local database
   */
  private getVideoPublishedDate(videoId: string): string {
    const video = this.videosDb.find(v => v.id === videoId);
    return video?.publishedAt || new Date().toISOString();
  }

  /**
   * Convert YouTube playlist item to local format
   */
  private convertToLocalPlaylistItem(item: YouTubePlaylistItem): LocalPlaylistItem {
    return {
      position: item.position,
      videoId: item.resourceId.videoId,
      title: this.getVideoTitle(item.resourceId.videoId),
      publishedAt: this.getVideoPublishedDate(item.resourceId.videoId)
    };
  }

  /**
   * Build content for a single playlist
   */
  private async buildPlaylistContent(playlistFile: string): Promise<void> {
    try {
      // Load playlist data
      const playlistData = await fs.readJson(playlistFile) as LocalPlaylist;
      const playlistId = playlistData.id;

      this.logger.info(`Building content for playlist: ${playlistData.title} (stored: ${playlistData.itemCount} items, current: ${playlistData.items?.length || 0} items)`);

      const playlistItems: LocalPlaylistItem[] = [];
      let pageToken: string | undefined;
      let pageCount = 0;
      const maxResults = 50;

      do {
        pageCount++;
        this.logger.verbose(`Fetching playlist items page ${pageCount} for ${playlistData.title}`);

        try {
          const response = await this.youtubeClient.getPlaylistItems(playlistId, pageToken, maxResults);
          
          if (!response.items || response.items.length === 0) {
            this.logger.verbose('No more playlist items found');
            break;
          }

          // Debug: Log first item structure
          if (pageCount === 1 && response.items.length > 0) {
            this.logger.verbose(`First playlist item structure: ${JSON.stringify(response.items[0], null, 2)}`);
          }

          // Process items from this page
          for (const item of response.items) {
            const localItem = this.convertToLocalPlaylistItem(item);
            playlistItems.push(localItem);
          }

          this.logger.verbose(`Page ${pageCount}: Found ${response.items.length} items`);
          
          // Move to next page
          pageToken = response.nextPageToken;

        } catch (error) {
          this.logger.error(`Failed to fetch playlist items page ${pageCount} for ${playlistData.title}`, error as Error);
          
          // If it's a rate limit error, stop immediately
          if (error instanceof Error && error.message.includes('rate limit')) {
            this.logger.error('Rate limit exceeded, stopping.');
            break;
          }
          
          // For other errors, continue to next page
          continue;
        }

      } while (pageToken);

      // Update playlist data with items
      playlistData.items = playlistItems;
      playlistData.itemCount = playlistItems.length;

      // Save updated playlist data
      await fs.writeJson(playlistFile, playlistData, { spaces: 2 });
      this.logger.success(`Built content for ${playlistData.title}: ${playlistItems.length} items`);

    } catch (error) {
      this.logger.error(`Failed to build content for playlist file: ${playlistFile}`, error as Error);
    }
  }

  /**
   * Build content for all playlists
   */
  async buildAllPlaylistContent(): Promise<void> {
    try {
      this.logger.info('Starting playlist content build...');

      // Get all playlist files
      const playlistFiles = await fs.readdir(this.playlistsDir);
      const jsonFiles = playlistFiles.filter(file => file.endsWith('.json'));

      if (jsonFiles.length === 0) {
        this.logger.warning('No playlist files found. Run discover-playlists.ts first.');
        return;
      }

      this.logger.info(`Found ${jsonFiles.length} playlist files to process`);

      let processedCount = 0;
      let totalItems = 0;

      for (const file of jsonFiles) {
        const filePath = path.join(this.playlistsDir, file);
        
        try {
          await this.buildPlaylistContent(filePath);
          processedCount++;

          // Update progress
          this.logger.progress(processedCount, jsonFiles.length, 'Playlists Processed');

          // Check rate limits
          const rateLimit = this.youtubeClient.getRateLimitInfo();
          const remaining = rateLimit.quotaLimit - rateLimit.quotaUsed;
          if (remaining < 100) {
            this.logger.warning(`Rate limit approaching: ${remaining} units remaining`);
          }

        } catch (error) {
          this.logger.error(`Failed to process playlist file: ${file}`, error as Error);
        }
      }

      // Calculate total items
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.playlistsDir, file);
          const playlistData = await fs.readJson(filePath) as LocalPlaylist;
          totalItems += playlistData.items.length;
        } catch (error) {
          // Ignore errors for statistics
        }
      }

      this.logger.success(`Playlist content build completed! Processed ${processedCount} playlists with ${totalItems} total items`);

    } catch (error) {
      this.logger.error('Failed to build playlist content', error as Error);
      throw error;
    }
  }

  /**
   * Build content for a specific playlist
   */
  async buildSpecificPlaylist(playlistName: string): Promise<void> {
    try {
      const sanitizedName = playlistName
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase()
        .trim();

      const filePath = path.join(this.playlistsDir, `${sanitizedName}.json`);

      if (!(await fs.pathExists(filePath))) {
        this.logger.error(`Playlist file not found: ${filePath}`);
        return;
      }

      await this.buildPlaylistContent(filePath);

    } catch (error) {
      this.logger.error(`Failed to build content for playlist: ${playlistName}`, error as Error);
    }
  }

  /**
   * Clean up playlist content
   */
  async clean(): Promise<void> {
    try {
      const playlistFiles = await fs.readdir(this.playlistsDir);
      const jsonFiles = playlistFiles.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.playlistsDir, file);
        const playlistData = await fs.readJson(filePath) as LocalPlaylist;
        
        // Clear items but keep playlist metadata
        playlistData.items = [];
        playlistData.itemCount = 0;

        await fs.writeJson(filePath, playlistData, { spaces: 2 });
      }

      this.logger.success('Cleaned up playlist content');
    } catch (error) {
      this.logger.error('Failed to clean up playlist content', error as Error);
    }
  }
}

// Main execution
async function main() {
  const builder = new PlaylistContentBuilder();
  
  try {
    await builder.initialize();

    const args = process.argv.slice(2);
    const command = args[0];
    const playlistName = args[1];

    switch (command) {
      case 'clean':
        await builder.clean();
        break;
      case 'playlist':
        if (playlistName) {
          await builder.buildSpecificPlaylist(playlistName);
        } else {
          console.error('Please specify a playlist name');
          process.exit(1);
        }
        break;
      case 'build':
      default:
        await builder.buildAllPlaylistContent();
        break;
    }

  } catch (error) {
    console.error('Playlist content build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}