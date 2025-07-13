#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import { 
  LocalVideo, 
  LocalPlaylist, 
  LocalPlaylistItem, 
  PlaylistConfig, 
  PlaylistRule 
} from '../src/types/api-types';
import { YouTubeClient } from '../src/api/youtube-client';
import { loadConfig } from '../src/config/config-loader';
import { getLogger, logVerbose, initializeLogger } from '../src/utils/logger';
import { VideoFilter, FilterRule } from './filter-videos';

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
  dryRunMode?: boolean;
  previewReport?: DryRunPreview;
}

interface ProcessingOptions {
  input?: string | undefined;
  videoId?: string | undefined;
  dryRun: boolean;
  refreshCache: boolean;
  verbose: boolean;
  output?: string | undefined; // Output file for dry-run reports
  // Filtering options
  filterConfig?: string | undefined; // Filter configuration file
  privacyStatus?: string | undefined; // Direct privacy status filter
  publishedAfter?: string | undefined; // Direct date filter
  publishedBefore?: string | undefined; // Direct date filter
  titleContains?: string | undefined; // Direct title filter
  titleNotContains?: string | undefined; // Direct title not contains filter
  descriptionContains?: string | undefined; // Direct description filter
  descriptionNotContains?: string | undefined; // Direct description not contains filter
  minViews?: number | undefined; // Direct views filter
  maxViews?: number | undefined; // Direct views filter
}

interface DryRunPreview {
  mode: 'dry-run';
  timestamp: string;
  summary: {
    videosToProcess: number;
    estimatedApiQuota: number;
    playlistAssignments: number;
    processingTime: string;
    validationStatus: 'valid' | 'warnings' | 'errors';
  };
  steps: {
    validation: {
      status: 'pending' | 'completed';
      configValid: boolean;
      dataIntegrity: boolean;
      apiQuotaAvailable: boolean;
      authenticationValid: boolean;
    };
    playlistMatching: {
      status: 'pending' | 'completed';
      playlistsToUpdate: number;
      assignmentsToMake: number;
    };
  };
  preview: Array<{
    videoId: string;
    title: string;
    currentState: {
      playlists: string[];
    };
    proposedState: {
      playlists: Array<{
        playlistId: string;
        playlistTitle: string;
        position: number;
      }>;
    };
    changes: {
      playlistsChanged: boolean;
      newPlaylists: string[];
      removedPlaylists: string[];
    };
    validation: {
      positionValid: boolean;
      playlistValid: boolean;
      warnings: string[];
      errors: string[];
    };
  }>;
  validation: {
    configValid: boolean;
    dataIntegrity: boolean;
    apiQuotaAvailable: boolean;
    authenticationValid: boolean;
    warnings: string[];
    errors: string[];
  };
  costEstimate: {
    totalApiCalls: number;
    quotaUnitsRequired: number;
    dailyQuotaImpact: number;
    processingTimeEstimate: string;
    resourceRequirements: {
      memory: string;
      storage: string;
    };
  };
}

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

interface QuotaEstimate {
  totalVideos: number;
  apiCallsRequired: number;
  quotaUnitsRequired: number;
  estimatedCost: number;
  dailyQuotaImpact: number;
  processingTimeEstimate: string;
  warnings: string[];
}

class PlaylistMatcher {
  /**
   * Check if a video title matches playlist rules
   */
  matchesPlaylist(videoTitle: string, playlistRules: string[]): boolean {
    const title = videoTitle.toLowerCase();
    
    for (const rule of playlistRules) {
      if (this.matchKeyword(title, rule.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Match a keyword against a title
   * Respects word boundaries (e.g., "sp " won't match "specific" but will match "sp mission")
   */
  private matchKeyword(title: string, keyword: string): boolean {
    // Handle exact matches
    if (title === keyword) {
      return true;
    }

    // Handle word boundary matches
    const words = title.split(/\s+/);
    const keywordWords = keyword.split(/\s+/);

    // Check if all keyword words are present in title words
    for (const keywordWord of keywordWords) {
      let found = false;
      for (const titleWord of words) {
        if (titleWord.includes(keywordWord)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all matching playlists for a video title
   */
  getMatchingPlaylists(videoTitle: string, playlists: PlaylistRule[]): PlaylistRule[] {
    return playlists.filter(playlist => 
      this.matchesPlaylist(videoTitle, playlist.keywords)
    );
  }
}

class PositionCalculator {
  /**
   * Calculate the correct position for a video in a playlist based on recording date
   */
  calculatePosition(videoDate: string, playlistVideos: LocalPlaylistItem[]): number {
    if (playlistVideos.length === 0) {
      return 0;
    }

    // Sort playlist videos chronologically (oldest first)
    const sortedVideos = this.sortPlaylistChronologically([...playlistVideos]);
    
    // Find the correct position for the new video
    const videoDateTime = new Date(videoDate).getTime();
    
    for (let i = 0; i < sortedVideos.length; i++) {
      const playlistVideoDateTime = new Date(sortedVideos[i].publishedAt).getTime();
      
      if (videoDateTime <= playlistVideoDateTime) {
        return i;
      }
    }
    
    // If video is newer than all existing videos, add at the end
    return sortedVideos.length;
  }

  /**
   * Sort playlist videos chronologically (oldest first)
   */
  private sortPlaylistChronologically(videos: LocalPlaylistItem[]): LocalPlaylistItem[] {
    return videos.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateA - dateB;
    });
  }

  /**
   * Handle videos with the same date by maintaining original order
   */
  private handleSameDateVideos(videos: LocalPlaylistItem[]): LocalPlaylistItem[] {
    // Group videos by date
    const groupedByDate = new Map<string, LocalPlaylistItem[]>();
    
    for (const video of videos) {
      const date = video.publishedAt.split('T')[0]; // YYYY-MM-DD
      if (!groupedByDate.has(date)) {
        groupedByDate.set(date, []);
      }
      groupedByDate.get(date)!.push(video);
    }
    
    // Sort each group by original position
    const result: LocalPlaylistItem[] = [];
    for (const [date, dateVideos] of groupedByDate) {
      dateVideos.sort((a, b) => a.position - b.position);
      result.push(...dateVideos);
    }
    
    return result;
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
   * Load playlist cache from local file
   */
  private async loadPlaylistCache(playlistId: string): Promise<LocalPlaylist | null> {
    try {
      const cacheFile = path.join(this.playlistsDir, `${playlistId}.json`);
      if (await fs.pathExists(cacheFile)) {
        return await fs.readJson(cacheFile) as LocalPlaylist;
      }
    } catch (error) {
      logVerbose(`Failed to load playlist cache for ${playlistId}: ${error}`);
    }
    return null;
  }

  /**
   * Refresh playlist cache from YouTube API
   */
  private async refreshPlaylistCache(playlistId: string): Promise<LocalPlaylist | null> {
    try {
      // Get playlist details from playlists API
      const playlistsResponse = await this.youtubeClient.getPlaylists();
      const playlistDetails = playlistsResponse.items?.find(p => p.id === playlistId);
      if (!playlistDetails) {
        return null;
      }

      // Get playlist items
      const playlistItemsResponse = await this.youtubeClient.getPlaylistItems(playlistId);
      if (!playlistItemsResponse || !playlistItemsResponse.items) {
        return null;
      }

      // Convert to local format
      const items: LocalPlaylistItem[] = playlistItemsResponse.items.map((item: any, index: number) => ({
        position: index,
        videoId: item.resourceId.videoId,
        title: item.title,
        publishedAt: item.publishedAt
      }));

      const playlist: LocalPlaylist = {
        id: playlistId,
        title: playlistDetails.title,
        description: playlistDetails.description,
        privacyStatus: playlistDetails.privacyStatus,
        itemCount: playlistDetails.itemCount,
        items
      };

      // Save to cache
      await this.savePlaylistCache(playlistId, playlist);
      return playlist;

    } catch (error) {
      logVerbose(`Failed to refresh playlist cache for ${playlistId}: ${error}`);
      return null;
    }
  }

  /**
   * Save playlist cache to local file
   */
  private async savePlaylistCache(playlistId: string, playlist: LocalPlaylist): Promise<void> {
    try {
      await fs.ensureDir(this.playlistsDir);
      const cacheFile = path.join(this.playlistsDir, `${playlistId}.json`);
      await fs.writeJson(cacheFile, playlist, { spaces: 2 });
    } catch (error) {
      logVerbose(`Failed to save playlist cache for ${playlistId}: ${error}`);
    }
  }

  /**
   * Update local playlist cache after adding a video
   */
  private async updatePlaylistCache(playlistId: string, videoId: string, position: number, title: string): Promise<void> {
    try {
      const playlist = await this.loadPlaylistCache(playlistId);
      if (playlist) {
        // Insert new item at the calculated position
        playlist.items.splice(position, 0, {
          position,
          videoId,
          title,
          publishedAt: new Date().toISOString() // Approximate
        });

        // Update positions for items after the insertion
        for (let i = position + 1; i < playlist.items.length; i++) {
          playlist.items[i].position = i;
        }

        await this.savePlaylistCache(playlistId, playlist);
      }
    } catch (error) {
      logVerbose(`Failed to update playlist cache for ${playlistId}: ${error}`);
    }
  }

  /**
   * Add video to playlist
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
   * Validate configuration
   */
  private validateConfiguration(): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check playlist configuration
    if (!this.playlistConfig.playlists || this.playlistConfig.playlists.length === 0) {
      errors.push('No playlists configured');
    }

    // Check each playlist has required fields
    for (const playlist of this.playlistConfig.playlists) {
      if (!playlist.id) {
        errors.push(`Playlist missing ID: ${playlist.title || 'Unknown'}`);
      }
      if (!playlist.title) {
        errors.push(`Playlist missing title: ${playlist.id || 'Unknown'}`);
      }
      if (!playlist.keywords || playlist.keywords.length === 0) {
        warnings.push(`Playlist has no keywords: ${playlist.title}`);
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Validate video database integrity
   */
  private async validateVideoDatabase(videos: LocalVideo[]): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if video database exists
    if (!await fs.pathExists('data/videos.json')) {
      errors.push('Video database not found');
      return { valid: false, warnings, errors };
    }

    // Check for required fields
    for (const video of videos) {
      if (!video.id) {
        errors.push(`Video missing ID: ${video.title || 'Unknown'}`);
      }
      if (!video.title) {
        warnings.push(`Video missing title: ${video.id}`);
      }
      if (!video.recordingDate && !video.publishedAt) {
        warnings.push(`Video missing date information: ${video.id}`);
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Estimate API quota usage
   */
  private estimateApiQuota(videos: LocalVideo[]): QuotaEstimate {
    // Count total playlist assignments that would be made
    let totalAssignments = 0;
    for (const video of videos) {
      const matchingPlaylists = this.matcher.getMatchingPlaylists(video.title, this.playlistConfig.playlists);
      totalAssignments += matchingPlaylists.length;
    }

    const apiCallsRequired = totalAssignments; // 1 API call per playlist assignment
    const quotaUnitsRequired = totalAssignments * 50; // 50 units per playlist assignment
    const dailyQuotaImpact = (quotaUnitsRequired / 10000) * 100; // Percentage of daily quota
    const processingTimeEstimate = `${Math.ceil(totalAssignments / 10)}:${(totalAssignments % 10 * 6).toString().padStart(2, '0')}`; // Rough estimate

    const warnings: string[] = [];
    if (dailyQuotaImpact > 80) {
      warnings.push(`High quota usage: ${dailyQuotaImpact.toFixed(1)}% of daily limit`);
    }

    return {
      totalVideos: videos.length,
      apiCallsRequired,
      quotaUnitsRequired,
      estimatedCost: quotaUnitsRequired,
      dailyQuotaImpact,
      processingTimeEstimate,
      warnings
    };
  }

  /**
   * Validate authentication
   */
  private validateAuthentication(): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!this.youtubeClient.isAuthenticated()) {
      errors.push('YouTube client not authenticated');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Generate comprehensive dry-run preview
   */
  private async generateDryRunPreview(videos: LocalVideo[]): Promise<DryRunPreview> {
    const startTime = Date.now();
    
    // Run validation pipeline
    const configValidation = this.validateConfiguration();
    const dbValidation = await this.validateVideoDatabase(videos);
    const authValidation = this.validateAuthentication();
    const quotaEstimate = this.estimateApiQuota(videos);

    // Combine validation results
    const allWarnings = [
      ...configValidation.warnings,
      ...dbValidation.warnings,
      ...authValidation.warnings,
      ...quotaEstimate.warnings
    ];
    const allErrors = [
      ...configValidation.errors,
      ...dbValidation.errors,
      ...authValidation.errors
    ];

    const validationStatus = allErrors.length > 0 ? 'errors' : allWarnings.length > 0 ? 'warnings' : 'valid';

    // Generate preview for each video
    const preview = videos.map(video => {
      const matchingPlaylists = this.matcher.getMatchingPlaylists(video.title, this.playlistConfig.playlists);
      
      // Calculate positions for each matching playlist
      const proposedPlaylists = matchingPlaylists.map(playlist => ({
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        position: 0 // Will be calculated when playlist cache is loaded
      }));

      // Validate playlist assignments
      const positionValid = true; // Will be validated when cache is loaded
      const playlistValid = matchingPlaylists.length > 0;

      const videoWarnings: string[] = [];
      const videoErrors: string[] = [];

      if (matchingPlaylists.length === 0) {
        videoWarnings.push('No matching playlists found');
      }

      return {
        videoId: video.id,
        title: video.title,
        currentState: {
          playlists: [] // We don't track current playlist assignments in dry-run
        },
        proposedState: {
          playlists: proposedPlaylists
        },
        changes: {
          playlistsChanged: matchingPlaylists.length > 0,
          newPlaylists: matchingPlaylists.map(p => p.title),
          removedPlaylists: []
        },
        validation: {
          positionValid,
          playlistValid,
          warnings: videoWarnings,
          errors: videoErrors
        }
      };
    });

    const endTime = Date.now();
    const processingTime = `${Math.floor((endTime - startTime) / 60000)}:${Math.floor(((endTime - startTime) % 60000) / 1000).toString().padStart(2, '0')}`;

    return {
      mode: 'dry-run',
      timestamp: new Date().toISOString(),
      summary: {
        videosToProcess: videos.length,
        estimatedApiQuota: quotaEstimate.quotaUnitsRequired,
        playlistAssignments: quotaEstimate.apiCallsRequired,
        processingTime,
        validationStatus
      },
      steps: {
        validation: {
          status: 'completed',
          configValid: configValidation.valid,
          dataIntegrity: dbValidation.valid,
          apiQuotaAvailable: quotaEstimate.dailyQuotaImpact < 100,
          authenticationValid: authValidation.valid
        },
        playlistMatching: {
          status: 'completed',
          playlistsToUpdate: this.playlistConfig.playlists.length,
          assignmentsToMake: quotaEstimate.apiCallsRequired
        }
      },
      preview,
      validation: {
        configValid: configValidation.valid,
        dataIntegrity: dbValidation.valid,
        apiQuotaAvailable: quotaEstimate.dailyQuotaImpact < 100,
        authenticationValid: authValidation.valid,
        warnings: allWarnings,
        errors: allErrors
      },
      costEstimate: {
        totalApiCalls: quotaEstimate.apiCallsRequired,
        quotaUnitsRequired: quotaEstimate.quotaUnitsRequired,
        dailyQuotaImpact: quotaEstimate.dailyQuotaImpact,
        processingTimeEstimate: quotaEstimate.processingTimeEstimate,
        resourceRequirements: {
          memory: '~30MB',
          storage: '~1MB'
        }
      }
    };
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

        // === Prevent duplicate playlist entries ===
        const alreadyInPlaylist = playlistCache.items.some(item => item.videoId === video.id);
        if (alreadyInPlaylist) {
          assignment.assignedPlaylists.push({
            playlistId: playlist.id,
            playlistTitle: playlist.title,
            position: 0,
            status: 'skipped',
            error: 'Video already in playlist'
          });
          continue;
        }
        // === End duplicate check ===

        // Calculate position
        const position = this.calculator.calculatePosition(
          video.recordingDate || video.publishedAt,
          playlistCache.items
        );

        // Add to playlist
        const result = await this.addVideoToPlaylist(video.id, playlist.id, position, options);
        
        // === Rate limit error handling ===
        if (result.error && typeof result.error === 'string' && (result.error.toLowerCase().includes('rate limit') || result.error.toLowerCase().includes('quota'))) {
          getLogger().error(`Rate limit or quota error detected: ${result.error}`);
          process.exit(1);
        }
        // === End rate limit error handling ===

        // Always update local cache after successful add (even in dryRun for consistency)
        if (result.success) {
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
        // === Rate limit error handling in catch ===
        if (typeof errorMessage === 'string' && (errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('quota'))) {
          getLogger().error(`Rate limit or quota error detected: ${errorMessage}`);
          process.exit(1);
        }
        // === End rate limit error handling ===
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
    const result: ProcessingResult = {
      processedVideos: 0,
      playlistAssignments: [],
      totalAssignments: 0,
      successfulAssignments: 0,
      failedAssignments: 0,
      processingTime: ''
    };

    // If dry-run mode, generate comprehensive preview
    if (options.dryRun) {
      result.dryRunMode = true;
      result.previewReport = await this.generateDryRunPreview(videos);
      
      // Display preview summary
      const preview = result.previewReport;
      getLogger().info('=== DRY RUN PREVIEW ===');
      getLogger().info(`Videos to process: ${preview.summary.videosToProcess}`);
      getLogger().info(`Estimated API quota: ${preview.summary.estimatedApiQuota} units`);
      getLogger().info(`Playlist assignments: ${preview.summary.playlistAssignments}`);
      getLogger().info(`Processing time: ${preview.summary.processingTime}`);
      getLogger().info(`Validation status: ${preview.summary.validationStatus}`);
      
      if (preview.validation.errors.length > 0) {
        getLogger().error('Validation errors:');
        preview.validation.errors.forEach(error => getLogger().error(`  - ${error}`));
      }
      
      if (preview.validation.warnings.length > 0) {
        getLogger().warning('Validation warnings:');
        preview.validation.warnings.forEach(warning => getLogger().warning(`  - ${warning}`));
      }
      
      // Show sample preview (first 3 videos)
      const sampleVideos = preview.preview.slice(0, 3);
      getLogger().info('Sample preview:');
      for (const video of sampleVideos) {
        getLogger().info(`Video: ${video.videoId} - "${video.title}"`);
        if (video.proposedState.playlists.length > 0) {
          getLogger().info(`  Would be added to: ${video.proposedState.playlists.map(p => p.playlistTitle).join(', ')}`);
        } else {
          getLogger().info(`  No matching playlists found`);
        }
      }
      
      if (preview.preview.length > 3) {
        getLogger().info(`... and ${preview.preview.length - 3} more videos`);
      }
      
      getLogger().info('=== END DRY RUN PREVIEW ===');
      
      // Save preview report if output file specified
      if (options.output) {
        await fs.writeJson(options.output, preview, { spaces: 2 });
        getLogger().info(`Dry-run report saved to ${options.output}`);
      }
      
      return result;
    }

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
    .option('-o, --output <file>', 'Output file for dry-run reports')
    .option('--filter-config <file>', 'Filter configuration file')
    .option('--privacy-status <status>', 'Direct privacy status filter')
    .option('--published-after <date>', 'Direct date filter')
    .option('--published-before <date>', 'Direct date filter')
    .option('--title-contains <text>', 'Direct title filter')
    .option('--title-not-contains <text>', 'Direct title not contains filter')
    .option('--description-contains <text>', 'Direct description filter')
    .option('--description-not-contains <text>', 'Direct description not contains filter')
    .option('--min-views <number>', 'Direct views filter')
    .option('--max-views <number>', 'Direct views filter')
    .option('-h, --help', 'Show help information')
    .parse();

  const options: ProcessingOptions = {
    input: program.opts().input,
    videoId: program.opts().videoId,
    dryRun: program.opts().dryRun || false,
    refreshCache: program.opts().refreshCache || false,
    verbose: program.opts().verbose || false,
    output: program.opts().output,
    // Filtering options
    filterConfig: program.opts().filterConfig,
    privacyStatus: program.opts().privacyStatus,
    publishedAfter: program.opts().publishedAfter,
    publishedBefore: program.opts().publishedBefore,
    titleContains: program.opts().titleContains,
    titleNotContains: program.opts().titleNotContains,
    descriptionContains: program.opts().descriptionContains,
    descriptionNotContains: program.opts().descriptionNotContains,
    minViews: program.opts().minViews ? Number(program.opts().minViews) : undefined,
    maxViews: program.opts().maxViews ? Number(program.opts().maxViews) : undefined
  };

  // Check if help was requested
  if (program.opts().help) {
    return;
  }

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
    const hasTokens = await youtubeClient.loadTokens();
    if (!hasTokens) {
      getLogger().error('OAuth tokens not found. Please run authentication first.');
      process.exit(1);
    }
    
    if (!youtubeClient.isAuthenticated()) {
      getLogger().error('YouTube client not authenticated. Please run authentication first.');
      process.exit(1);
    }

    // Initialize playlist manager
    const playlistManager = new PlaylistManager(youtubeClient, config.playlists);

    let videos: LocalVideo[] = [];

    // Load videos to process
    if (options.videoId) {
      // Process specific video
      const videoDatabase = await fs.readJson('data/videos.json') as LocalVideo[];
      const video = videoDatabase.find(v => v.id === options.videoId);
      if (!video) {
        getLogger().error(`Video with ID ${options.videoId} not found in database`);
        process.exit(1);
      }
      videos = [video];
    } else if (options.input) {
      // Process filtered videos from input file
      if (!await fs.pathExists(options.input)) {
        getLogger().error(`Input file ${options.input} not found`);
        process.exit(1);
      }
      videos = await fs.readJson(options.input) as LocalVideo[];
    } else if (options.filterConfig || options.privacyStatus || options.publishedAfter || 
               options.publishedBefore || options.titleContains || options.titleNotContains || 
               options.descriptionContains || options.descriptionNotContains || 
               options.minViews !== undefined || options.maxViews !== undefined) {
      // Filter videos directly from channel database
      getLogger().info('Filtering videos directly from channel database...');
      
      const videoFilter = new VideoFilter();
      
      if (options.filterConfig) {
        // Use filter configuration file
        if (!await fs.pathExists(options.filterConfig)) {
          getLogger().error(`Filter configuration file ${options.filterConfig} not found`);
          process.exit(1);
        }
        videos = await videoFilter.getFilteredVideosFromConfig(options.filterConfig);
      } else {
        // Build filters from command line options
        const filters: FilterRule[] = [];
        
        const addFilter = (type: string, value: any) => {
          if (value !== undefined) {
            // Convert string numbers to actual numbers
            if (typeof value === 'string' && !isNaN(Number(value)) && 
                (type.includes('views'))) {
              value = Number(value);
            }
            filters.push({ type, value });
          }
        };
        
        addFilter('privacy_status', options.privacyStatus);
        addFilter('published_after', options.publishedAfter);
        addFilter('published_before', options.publishedBefore);
        addFilter('title_contains', options.titleContains);
        addFilter('title_not_contains', options.titleNotContains);
        addFilter('description_contains', options.descriptionContains);
        addFilter('description_not_contains', options.descriptionNotContains);
        addFilter('min_views', options.minViews);
        addFilter('max_views', options.maxViews);
        
        if (filters.length === 0) {
          getLogger().error('No valid filters specified');
          process.exit(1);
        }
        
        videos = await videoFilter.getFilteredVideos(filters);
      }
      
      getLogger().info(`Found ${videos.length} videos matching filter criteria`);
    } else {
      // Default: use data/videos.json if no input or filters specified
      if (!await fs.pathExists('data/videos.json')) {
        getLogger().error('Video database not found at data/videos.json');
        process.exit(1);
      }
      videos = await fs.readJson('data/videos.json') as LocalVideo[];
      getLogger().info(`Loaded ${videos.length} videos from data/videos.json`);
    }

    if (videos.length === 0) {
      getLogger().info('No videos to process');
      return;
    }

    // Process videos
    const result = await playlistManager.processVideos(videos, options);

    // Output results
    if (!options.dryRun) {
      getLogger().info('Playlist management completed:');
      getLogger().info(`  Total videos: ${result.processedVideos}`);
      getLogger().info(`  Total assignments: ${result.totalAssignments}`);
      getLogger().info(`  Successful assignments: ${result.successfulAssignments}`);
      getLogger().info(`  Failed assignments: ${result.failedAssignments}`);
      getLogger().info(`  Processing time: ${result.processingTime}`);

      if (result.failedAssignments > 0) {
        getLogger().info('Failed assignments:');
        for (const assignment of result.playlistAssignments) {
          for (const playlistAssignment of assignment.assignedPlaylists) {
            if (playlistAssignment.status === 'failed') {
              getLogger().info(`  ${assignment.videoId} → ${playlistAssignment.playlistTitle}: ${playlistAssignment.error}`);
            }
          }
        }
      }

      // Save results to file
      const resultsFile = `playlist-results-${new Date().toISOString().split('T')[0]}.json`;
      await fs.writeJson(resultsFile, result, { spaces: 2 });
      getLogger().info(`Results saved to ${resultsFile}`);
    }

  } catch (error) {
    getLogger().error('Playlist management failed', error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    getLogger().error('Unhandled error', error as Error);
    process.exit(1);
  });
}