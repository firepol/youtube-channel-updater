#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { YouTubePlaylist, PlaylistConfig, PlaylistRule } from '../src/types/api-types';

class PlaylistDiscoverer {
  private youtubeClient!: YouTubeClient;
  private config: any;
  private logger: any;
  private playlistsDir: string;
  private configDir: string;

  constructor() {
    this.playlistsDir = 'data/playlists';
    this.configDir = 'config';
  }

  /**
   * Initialize the discoverer
   */
  async initialize(): Promise<void> {
    try {
      // Load configuration
      const configLoader = new ConfigLoader();
      this.config = await configLoader.loadConfig();

      // Initialize logger
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

      // Ensure directories exist
      await fs.ensureDir(this.playlistsDir);
      await fs.ensureDir(this.configDir);

      this.logger.info('Playlist discoverer initialized');
    } catch (error) {
      console.error('Failed to initialize playlist discoverer:', error);
      process.exit(1);
    }
  }

  /**
   * Sanitize playlist name for file naming
   */
  private sanitizePlaylistName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .toLowerCase()
      .trim();
  }

  /**
   * Create empty JSON file for playlist
   */
  private async createPlaylistFile(playlist: YouTubePlaylist): Promise<void> {
    const sanitizedName = this.sanitizePlaylistName(playlist.title);
    const filePath = path.join(this.playlistsDir, `${sanitizedName}.json`);
    
    const playlistData = {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      privacyStatus: playlist.privacyStatus,
      itemCount: playlist.itemCount,
      items: []
    };

    try {
      await fs.writeJson(filePath, playlistData, { spaces: 2 });
      this.logger.verbose(`Created playlist file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to create playlist file for ${playlist.title}`, error as Error);
    }
  }

  /**
   * Generate playlist configuration template
   */
  private generatePlaylistConfig(playlists: YouTubePlaylist[]): PlaylistConfig {
    const playlistRules: PlaylistRule[] = playlists.map(playlist => ({
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      keywords: [], // Empty keywords array for manual configuration
      visibility: playlist.privacyStatus as 'public' | 'private' | 'unlisted'
    }));

    return { playlists: playlistRules };
  }

  /**
   * Discover all playlists
   */
  async discoverPlaylists(): Promise<void> {
    try {
      this.logger.info('Starting playlist discovery...');

      const allPlaylists: YouTubePlaylist[] = [];
      let pageToken: string | undefined;
      let pageCount = 0;
      const maxResults = 50;

      do {
        pageCount++;
        this.logger.info(`Fetching playlists page ${pageCount}`);

        try {
          const response = await this.youtubeClient.getPlaylists(pageToken, maxResults);
          
          if (!response.items || response.items.length === 0) {
            this.logger.info('No more playlists found');
            break;
          }

          // Process playlists from this page
          for (const playlist of response.items) {
            allPlaylists.push(playlist);
            
            // Create empty JSON file for each playlist
            await this.createPlaylistFile(playlist);
          }

          this.logger.info(`Page ${pageCount}: Found ${response.items.length} playlists`);
          
          // Update progress
          this.logger.progress(allPlaylists.length, allPlaylists.length + (response.pageInfo.totalResults - allPlaylists.length), 'Playlists Discovered');

          // Check rate limits
          const rateLimit = this.youtubeClient.getRateLimitInfo();
          const remaining = rateLimit.quotaLimit - rateLimit.quotaUsed;
          if (remaining < 50) {
            this.logger.warning(`Rate limit approaching: ${remaining} units remaining`);
          }

          // Move to next page
          pageToken = response.nextPageToken;

        } catch (error) {
          this.logger.error(`Failed to fetch playlists page ${pageCount}`, error as Error);
          
          // If it's a rate limit error, stop immediately
          if (error instanceof Error && error.message.includes('rate limit')) {
            this.logger.error('Rate limit exceeded, stopping.');
            break;
          }
          
          // For other errors, continue to next page
          continue;
        }

      } while (pageToken);

      // Generate playlist configuration template
      const playlistConfig = this.generatePlaylistConfig(allPlaylists);
      const configPath = path.join(this.configDir, 'playlists.json');
      
      try {
        await fs.writeJson(configPath, playlistConfig, { spaces: 2 });
        this.logger.success(`Generated playlist configuration template: ${configPath}`);
      } catch (error) {
        this.logger.error('Failed to write playlist configuration template', error as Error);
      }

      this.logger.success(`Playlist discovery completed! Found ${allPlaylists.length} playlists`);
      
      // Log statistics
      const publicPlaylists = allPlaylists.filter(p => p.privacyStatus === 'public').length;
      const privatePlaylists = allPlaylists.filter(p => p.privacyStatus === 'private').length;
      const unlistedPlaylists = allPlaylists.filter(p => p.privacyStatus === 'unlisted').length;
      
      this.logger.info(`Statistics: ${publicPlaylists} public, ${privatePlaylists} private, ${unlistedPlaylists} unlisted playlists`);

      // List discovered playlists
      this.logger.info('Discovered playlists:');
      for (const playlist of allPlaylists) {
        const sanitizedName = this.sanitizePlaylistName(playlist.title);
        this.logger.info(`  - ${playlist.title} (${playlist.itemCount} items) -> ${sanitizedName}.json`);
      }

    } catch (error) {
      this.logger.error('Failed to discover playlists', error as Error);
      throw error;
    }
  }

  /**
   * Clean up playlist files
   */
  async clean(): Promise<void> {
    try {
      await fs.emptyDir(this.playlistsDir);
      this.logger.success('Cleaned up playlist files');
    } catch (error) {
      this.logger.error('Failed to clean up playlist files', error as Error);
    }
  }
}

// Main execution
async function main() {
  const discoverer = new PlaylistDiscoverer();
  
  try {
    await discoverer.initialize();

    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'clean':
        await discoverer.clean();
        break;
      case 'discover':
      default:
        await discoverer.discoverPlaylists();
        break;
    }

  } catch (error) {
    console.error('Playlist discovery failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
} 