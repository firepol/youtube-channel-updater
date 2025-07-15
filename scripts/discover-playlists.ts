#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { YouTubePlaylist, PlaylistConfig, PlaylistRule } from '../src/types/api-types';
import { sanitizePlaylistName } from '../src/utils/playlist';

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
   * Correct privacy status based on playlist title and other indicators
   */
  private correctPrivacyStatus(playlist: YouTubePlaylist): string {
    const title = playlist.title?.toLowerCase() || '';
    
    // Check for explicit unlisted indicators in title
    if (title.includes('unlisted') || title.includes('(unlisted)')) {
      return 'unlisted';
    }
    
    // Check for explicit private indicators in title
    if (title.includes('private') || title.includes('(private)')) {
      return 'private';
    }
    
    // Most playlists are likely public unless explicitly marked otherwise
    // You can customize this logic based on your channel's patterns
    return 'public';
  }

  /**
   * Create empty JSON file for playlist
   */
  private async createPlaylistFile(playlist: YouTubePlaylist): Promise<void> {
    const sanitizedName = sanitizePlaylistName(playlist.title);
    const filePath = path.join(this.playlistsDir, `${sanitizedName}.json`);
    
    const playlistData = {
      id: playlist.id,
      title: playlist.title || 'Untitled Playlist',
      description: playlist.description || '',
      privacyStatus: this.correctPrivacyStatus(playlist),
      itemCount: playlist.itemCount || 0,
      items: []
    };

    try {
      await fs.writeJson(filePath, playlistData, { spaces: 2 });
      this.logger.verbose(`Created playlist file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to create playlist file for ${playlist.title || 'untitled'}`, error as Error);
    }
  }

  /**
   * Load existing playlist configuration
   */
  private async loadExistingPlaylistConfig(): Promise<PlaylistConfig> {
    const configPath = path.join(this.configDir, 'playlists.json');
    
    try {
      if (await fs.pathExists(configPath)) {
        const existingConfig = await fs.readJson(configPath);
        this.logger.verbose('Loaded existing playlist configuration');
        return existingConfig;
      }
    } catch (error) {
      this.logger.warning('Failed to load existing playlist configuration, starting fresh');
    }
    
    return { playlists: [] };
  }

  /**
   * Merge discovered playlists with existing configuration
   */
  private mergePlaylistConfigs(
    existingConfig: PlaylistConfig, 
    discoveredPlaylists: YouTubePlaylist[]
  ): PlaylistConfig {
    const existingPlaylists = new Map(
      existingConfig.playlists.map(p => [p.id, p])
    );
    
    const mergedPlaylists: PlaylistRule[] = [];
    let updatedCount = 0;
    
    for (const discoveredPlaylist of discoveredPlaylists) {
      const existingPlaylist = existingPlaylists.get(discoveredPlaylist.id);
      
      if (existingPlaylist) {
        // Check if title or description has changed
        const titleChanged = discoveredPlaylist.title !== existingPlaylist.title;
        const descriptionChanged = discoveredPlaylist.description !== existingPlaylist.description;
        
        if (titleChanged || descriptionChanged) {
          updatedCount++;
          this.logger.info(`Updating playlist "${discoveredPlaylist.title}":`);
          if (titleChanged) {
            this.logger.info(`  Title: "${existingPlaylist.title}" → "${discoveredPlaylist.title}"`);
          }
          if (descriptionChanged) {
            this.logger.info(`  Description: "${existingPlaylist.description}" → "${discoveredPlaylist.description}"`);
          }
        }
        
        // Update existing playlist - preserve user fields, update API fields
        mergedPlaylists.push({
          id: discoveredPlaylist.id,
          title: discoveredPlaylist.title || existingPlaylist.title,
          description: discoveredPlaylist.description || existingPlaylist.description,
          keywords: existingPlaylist.keywords, // Preserve user-configured keywords
          visibility: existingPlaylist.visibility // Preserve user-configured visibility
        });
        
        if (!titleChanged && !descriptionChanged) {
          this.logger.verbose(`No changes for existing playlist: ${discoveredPlaylist.title}`);
        }
      } else {
        // Add new playlist with defaults
        mergedPlaylists.push({
          id: discoveredPlaylist.id,
          title: discoveredPlaylist.title || 'Untitled Playlist',
          description: discoveredPlaylist.description || '',
          keywords: [], // Empty keywords for new playlists
          visibility: (discoveredPlaylist.privacyStatus as 'public' | 'private' | 'unlisted') || 'private'
        });
        
        this.logger.info(`Added new playlist: ${discoveredPlaylist.title}`);
      }
    }
    
    if (updatedCount > 0) {
      this.logger.info(`Updated ${updatedCount} existing playlists with new API data`);
    }
    
    return { playlists: mergedPlaylists };
  }



  /**
   * Discover all playlists
   */
  async discoverPlaylists(): Promise<void> {
    try {
      this.logger.info('Starting playlist discovery...');

      // Load existing configuration first
      const existingConfig = await this.loadExistingPlaylistConfig();
      this.logger.info(`Found ${existingConfig.playlists.length} existing playlist configurations`);

      // Log authentication status
      const isAuthenticated = this.youtubeClient.isAuthenticated();
      this.logger.info(`OAuth authentication: ${isAuthenticated ? 'Available' : 'Not available'}`);
      if (!isAuthenticated) {
        this.logger.warning('OAuth not available. Some unlisted playlists may not be visible.');
      }

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
            const correctedPrivacy = this.correctPrivacyStatus(playlist);
            // Temporary debug: Log each playlist found with both API and corrected privacy status
            console.log(`Found playlist: "${playlist.title}" (${correctedPrivacy}) - ${playlist.id}`);
            
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

      // Merge discovered playlists with existing configuration
      const mergedConfig = this.mergePlaylistConfigs(existingConfig, allPlaylists);
      const configPath = path.join(this.configDir, 'playlists.json');
      
      try {
        await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
        this.logger.success(`Updated playlist configuration: ${configPath}`);
        this.logger.info(`Preserved ${existingConfig.playlists.length} existing configurations`);
        this.logger.info(`Added ${mergedConfig.playlists.length - existingConfig.playlists.length} new playlists`);
      } catch (error) {
        this.logger.error('Failed to write playlist configuration', error as Error);
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
        const sanitizedName = sanitizePlaylistName(playlist.title);
        this.logger.info(`  - ${playlist.title || 'Untitled Playlist'} (${playlist.itemCount || 0} items) -> ${sanitizedName}.json`);
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