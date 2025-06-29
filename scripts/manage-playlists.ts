#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import { 
  LocalVideo, 
  PlaylistConfig, 
  PlaylistRule,
  LocalPlaylist,
  LocalPlaylistItem
} from '../src/types/api-types';
import { YouTubeClient } from '../src/api/youtube-client';
import { loadConfig } from '../src/config/config-loader';
import { getLogger, logVerbose, initializeLogger } from '../src/utils/logger';

interface PlaylistAssignment {
  videoId: string;
  title: string;
  assignedPlaylists: Array<{
    playlistId: string;
    playlistTitle: string;
    position: number;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
  }>;
}

interface ProcessingResult {
  processedVideos: number;
  playlistAssignments: PlaylistAssignment[];
  totalAssignments: number;
  successfulAssignments: number;
  failedAssignments: number;
  processingTime: string;
}

interface ProcessingOptions {
  input?: string;
  videoId?: string;
  dryRun: boolean;
  refreshCache: boolean;
  verbose: boolean;
}

class PlaylistMatcher {
  /**
   * Check if video matches playlist rules
   */
  matchesPlaylist(videoTitle: string, playlistRules: string[]): boolean {
    return playlistRules.some(keyword => this.matchKeyword(videoTitle, keyword));
  }

  /**
   * Case-insensitive matching with space respect
   * "sp " won't match "specific" but will match "sp mission"
   */
  matchKeyword(title: string, keyword: string): boolean {
    const titleLower = title.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    
    // Exact match
    if (titleLower === keywordLower) {
      return true;
    }
    
    // Word boundary match
    const wordBoundaryRegex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (wordBoundaryRegex.test(titleLower)) {
      return true;
    }
    
    // Phrase match (for multi-word keywords)
    if (keywordLower.includes(' ') && titleLower.includes(keywordLower)) {
      return true;
    }
    
    return false;
  }

  /**
   * Get all matching playlists for a video
   */
  getMatchingPlaylists(videoTitle: string, playlists: PlaylistRule[]): PlaylistRule[] {
    return playlists.filter(playlist => this.matchesPlaylist(videoTitle, playlist.keywords));
  }
}

class PositionCalculator {
  /**
   * Calculate correct chronological position in playlist
   */
  calculatePosition(videoDate: string, playlistVideos: LocalPlaylistItem[]): number {
    if (!videoDate) {
      // If no date, add to end
      return playlistVideos.length;
    }

    const videoDateTime = new Date(videoDate).getTime();
    
    // Find the correct position based on chronological order
    for (let i = 0; i < playlistVideos.length; i++) {
      const playlistVideoDate = playlistVideos[i].publishedAt;
      if (playlistVideoDate) {
        const playlistVideoDateTime = new Date(playlistVideoDate).getTime();
        if (videoDateTime <= playlistVideoDateTime) {
          return i;
        }
      }
    }
    
    // If video is newer than all existing videos, add to end
    return playlistVideos.length;
  }

  /**
   * Sort playlist videos by recording date
   */
  sortPlaylistChronologically(videos: LocalPlaylistItem[]): LocalPlaylistItem[] {
    return [...videos].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateA - dateB;
    });
  }

  /**
   * Handle videos with same date (use time or published date)
   */
  handleSameDateVideos(videos: LocalPlaylistItem[]): LocalPlaylistItem[] {
    return videos.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      
      if (dateA === dateB) {
        // If same date, sort by video ID for consistency
        return a.videoId.localeCompare(b.videoId);
      }
      
      return dateA - dateB;
    });
  }
}

class PlaylistManager {
  private youtubeClient: YouTubeClient;
  private playlistConfig: PlaylistConfig;
  private matcher: PlaylistMatcher;
  private calculator: PositionCalculator;
  private playlistsDir: string;

  constructor(youtubeClient: YouTubeClient, playlistConfig: PlaylistConfig) {
    this.youtubeClient = youtubeClient;
    this.playlistConfig = playlistConfig;
    this.matcher = new PlaylistMatcher();
    this.calculator = new PositionCalculator();
    this.playlistsDir = path.join('data', 'playlists');
  }

  /**
   * Load local playlist cache
   */
  private async loadPlaylistCache(playlistId: string): Promise<LocalPlaylist | null> {
    const playlistFile = path.join(this.playlistsDir, `${playlistId}.json`);
    
    if (!await fs.pathExists(playlistFile)) {
      return null;
    }

    try {
      return await fs.readJson(playlistFile) as LocalPlaylist;
    } catch (error) {
      console.error(`Failed to load playlist cache for ${playlistId}`, error as Error);
      return null;
    }
  }

  /**
   * Refresh playlist cache from YouTube API
   */
  private async refreshPlaylistCache(playlistId: string): Promise<LocalPlaylist | null> {
    try {
      console.log(`Refreshing cache for playlist ${playlistId}`);
      
      const playlistItemsResponse = await this.youtubeClient.getPlaylistItems(playlistId);
      const playlistItems = playlistItemsResponse.items || [];
      
      if (playlistItems.length === 0) {
        // Create empty playlist cache
        const emptyPlaylist: LocalPlaylist = {
          id: playlistId,
          title: 'Unknown',
          description: '',
          privacyStatus: 'private',
          itemCount: 0,
          items: []
        };
        
        await this.savePlaylistCache(playlistId, emptyPlaylist);
        return emptyPlaylist;
      }

      // Get playlist details from playlists API
      const playlistsResponse = await this.youtubeClient.getPlaylists();
      const playlistDetails = playlistsResponse.items?.find(p => p.id === playlistId);
      
      // Convert to local format
      const localItems: LocalPlaylistItem[] = playlistItems.map((item, index) => ({
        position: index,
        videoId: item.resourceId.videoId,
        title: item.title,
        publishedAt: item.publishedAt
      }));

      const localPlaylist: LocalPlaylist = {
        id: playlistId,
        title: playlistDetails?.title || 'Unknown',
        description: playlistDetails?.description || '',
        privacyStatus: playlistDetails?.privacyStatus || 'private',
        itemCount: playlistItems.length,
        items: localItems
      };

      await this.savePlaylistCache(playlistId, localPlaylist);
      return localPlaylist;
    } catch (error) {
      console.error(`Failed to refresh playlist cache for ${playlistId}`, error as Error);
      return null;
    }
  }

  /**
   * Save playlist cache to file
   */
  private async savePlaylistCache(playlistId: string, playlist: LocalPlaylist): Promise<void> {
    await fs.ensureDir(this.playlistsDir);
    const playlistFile = path.join(this.playlistsDir, `${playlistId}.json`);
    await fs.writeJson(playlistFile, playlist, { spaces: 2 });
  }

  /**
   * Update playlist cache after insertion
   */
  private async updatePlaylistCache(playlistId: string, videoId: string, position: number, title: string): Promise<void> {
    const playlist = await this.loadPlaylistCache(playlistId);
    if (!playlist) {
      return;
    }

    // Insert video at correct position
    const newItem: LocalPlaylistItem = {
      position,
      videoId,
      title,
      publishedAt: new Date().toISOString()
    };

    playlist.items.splice(position, 0, newItem);
    
    // Update positions for all items after insertion
    for (let i = position + 1; i < playlist.items.length; i++) {
      playlist.items[i].position = i;
    }
    
    playlist.itemCount = playlist.items.length;
    
    await this.savePlaylistCache(playlistId, playlist);
  }

  /**
   * Add video to playlist at specific position
   */
  private async addVideoToPlaylist(
    videoId: string, 
    playlistId: string, 
    position: number,
    options: ProcessingOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would add video ${videoId} to playlist ${playlistId} at position ${position}`);
        return { success: true };
      }

      await this.youtubeClient.addToPlaylist(playlistId, videoId, position);
      console.log(`Added video ${videoId} to playlist ${playlistId} at position ${position}`);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to add video ${videoId} to playlist ${playlistId}`, error as Error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Process a single video for playlist assignment
   */
  private async processVideo(
    video: LocalVideo, 
    options: ProcessingOptions
  ): Promise<PlaylistAssignment> {
    const assignment: PlaylistAssignment = {
      videoId: video.id,
      title: video.title,
      assignedPlaylists: []
    };

    // Find matching playlists
    const matchingPlaylists = this.matcher.getMatchingPlaylists(video.title, this.playlistConfig.playlists);
    
    if (matchingPlaylists.length === 0) {
      console.log(`No matching playlists found for video: ${video.title}`);
      return assignment;
    }

    console.log(`Video "${video.title}" matches ${matchingPlaylists.length} playlists`);

    // Process each matching playlist
    for (const playlist of matchingPlaylists) {
      try {
        // Load or refresh playlist cache
        let playlistCache = await this.loadPlaylistCache(playlist.id);
        
        if (!playlistCache || options.refreshCache) {
          playlistCache = await this.refreshPlaylistCache(playlist.id);
        }

        if (!playlistCache) {
          assignment.assignedPlaylists.push({
            playlistId: playlist.id,
            playlistTitle: playlist.title,
            position: 0,
            status: 'failed',
            error: 'Failed to load playlist cache'
          });
          continue;
        }

        // Calculate position
        const position = this.calculator.calculatePosition(
          video.recordingDate || video.publishedAt,
          playlistCache.items
        );

        // Add to playlist
        const result = await this.addVideoToPlaylist(video.id, playlist.id, position, options);
        
        if (result.success && !options.dryRun) {
          // Update local cache
          await this.updatePlaylistCache(playlist.id, video.id, position, video.title);
        }

        assignment.assignedPlaylists.push({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          position,
          status: result.success ? 'success' : 'failed',
          ...(result.error && { error: result.error })
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        assignment.assignedPlaylists.push({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          position: 0,
          status: 'failed',
          error: errorMessage
        });
      }
    }

    return assignment;
  }

  /**
   * Process videos for playlist assignment
   */
  async processVideos(videos: LocalVideo[], options: ProcessingOptions): Promise<ProcessingResult> {
    const startTime = Date.now();
    const assignments: PlaylistAssignment[] = [];
    
    let totalAssignments = 0;
    let successfulAssignments = 0;
    let failedAssignments = 0;

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`Processing video ${i + 1}/${videos.length}: ${video.title}`);
      
      const assignment = await this.processVideo(video, options);
      assignments.push(assignment);
      
      // Count assignments
      for (const playlistAssignment of assignment.assignedPlaylists) {
        totalAssignments++;
        if (playlistAssignment.status === 'success') {
          successfulAssignments++;
        } else {
          failedAssignments++;
        }
      }
    }

    const processingTime = this.formatDuration(Date.now() - startTime);

    return {
      processedVideos: videos.length,
      playlistAssignments: assignments,
      totalAssignments,
      successfulAssignments,
      failedAssignments,
      processingTime
    };
  }

  /**
   * Format duration in HH:MM:SS
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('manage-playlists')
    .description('Add videos to playlists with proper chronological sorting')
    .option('-i, --input <file>', 'Input file with processed videos (JSON)')
    .option('--video-id <id>', 'Process specific video by ID')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--refresh-cache', 'Force refresh playlist cache from YouTube API')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-h, --help', 'Show help information')
    .parse();

  const options: ProcessingOptions = {
    input: program.opts().input,
    videoId: program.opts().videoId,
    dryRun: program.opts().dryRun || false,
    refreshCache: program.opts().refreshCache || false,
    verbose: program.opts().verbose || false
  };

  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }

  try {
    // Load configuration
    const config = await loadConfig();
    // Initialize logger
    initializeLogger({
      verbose: config.app.verbose,
      logLevel: config.app.logLevel as any,
      logsDir: config.paths.logsDir
    });
    const youtubeClient = new YouTubeClient(
      config.youtube.apiKey,
      config.youtube.clientId,
      config.youtube.clientSecret,
      config.youtube.channelId,
      config.rateLimiting.maxRetries,
      config.rateLimiting.retryDelayMs,
      config.rateLimiting.apiCallDelayMs
    );

    // Load OAuth tokens
    await youtubeClient.loadTokens();

    const manager = new PlaylistManager(youtubeClient, config.playlists);

    // Load videos to process
    let videos: LocalVideo[] = [];

    if (options.videoId) {
      // Process specific video
      const videoDatabase = await fs.readJson('data/videos.json') as LocalVideo[];
      const video = videoDatabase.find(v => v.id === options.videoId);
      
      if (!video) {
        console.error(`Video with ID ${options.videoId} not found in database`);
        process.exit(1);
      }
      
      videos = [video];
    } else if (options.input) {
      // Load from input file
      if (!await fs.pathExists(options.input)) {
        console.error(`Input file ${options.input} not found`);
        process.exit(1);
      }
      
      videos = await fs.readJson(options.input) as LocalVideo[];
    } else {
      // Load all videos from database
      if (!await fs.pathExists('data/videos.json')) {
        console.error('Video database not found. Run build-video-database.ts first.');
        process.exit(1);
      }
      
      videos = await fs.readJson('data/videos.json') as LocalVideo[];
    }

    if (videos.length === 0) {
      console.log('No videos to process');
      return;
    }

    getLogger().info(`Processing ${videos.length} videos for playlist assignment`);

    // Process videos
    const result = await manager.processVideos(videos, options);

    // Output results
    console.log('\n=== Playlist Management Results ===');
    console.log(`Processed Videos: ${result.processedVideos}`);
    console.log(`Total Assignments: ${result.totalAssignments}`);
    console.log(`Successful: ${result.successfulAssignments}`);
    console.log(`Failed: ${result.failedAssignments}`);
    console.log(`Processing Time: ${result.processingTime}`);

    if (options.verbose) {
      console.log('\n=== Detailed Assignments ===');
      for (const assignment of result.playlistAssignments) {
        if (assignment.assignedPlaylists.length > 0) {
          console.log(`\nVideo: ${assignment.title}`);
          for (const playlist of assignment.assignedPlaylists) {
            const status = playlist.status === 'success' ? '✅' : '❌';
            console.log(`  ${status} ${playlist.playlistTitle} (position ${playlist.position})`);
            if (playlist.error) {
              console.log(`    Error: ${playlist.error}`);
            }
          }
        }
      }
    }

    // Save results to file
    const resultsFile = `playlist-assignments-${new Date().toISOString().split('T')[0]}.json`;
    await fs.writeJson(resultsFile, result, { spaces: 2 });
    getLogger().info(`Results saved to ${resultsFile}`);

  } catch (error) {
    // Only use getLogger if initialized, otherwise fallback to console.error
    try {
      getLogger().error('Playlist management failed', error as Error);
    } catch {
      console.error('Playlist management failed', error);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    // Only use getLogger if initialized, otherwise fallback to console.error
    try {
      getLogger().error('Unhandled error', error as Error);
    } catch {
      console.error('Unhandled error', error);
    }
    process.exit(1);
  });
} 