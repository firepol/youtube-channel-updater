#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import { 
  LocalVideo, 
  VideoProcessingConfig, 
  ChangeHistory 
} from '../src/types/api-types';
import { YouTubeClient } from '../src/api/youtube-client';
import { loadConfig } from '../src/config/config-loader';
import { getLogger, logVerbose } from '../src/utils/logger';

interface ProcessingResult {
  processedVideos: number;
  successfulUpdates: number;
  failedUpdates: number;
  errors: Array<{
    videoId: string;
    error: string;
    attempts: number;
  }>;
  processingTime: string;
}

interface ProcessingOptions {
  input?: string;
  videoId?: string;
  dryRun: boolean;
  force: boolean;
  verbose: boolean;
}

class VideoProcessor {
  private youtubeClient: YouTubeClient;
  private config: VideoProcessingConfig;
  private backupDir: string;
  private historyFile: string;

  constructor(youtubeClient: YouTubeClient, config: VideoProcessingConfig) {
    this.youtubeClient = youtubeClient;
    this.config = config;
    this.backupDir = path.join('data', 'backups');
    this.historyFile = path.join('data', 'change-history.json');
  }

  /**
   * Initialize backup directory and history file
   */
  private async initializeBackup(): Promise<void> {
    await fs.ensureDir(this.backupDir);
    
    if (!await fs.pathExists(this.historyFile)) {
      await fs.writeJson(this.historyFile, [], { spaces: 2 });
    }
  }

  /**
   * Backup video data before processing
   */
  private async backupVideo(videoId: string, videoData: LocalVideo): Promise<void> {
    const backupFile = path.join(this.backupDir, `${videoId}.json`);
    await fs.writeJson(backupFile, {
      ...videoData,
      backupDate: new Date().toISOString()
    }, { spaces: 2 });
    logVerbose(`Backed up video ${videoId}`);
  }

  /**
   * Update change history
   */
  private async updateHistory(change: ChangeHistory): Promise<void> {
    const history = await fs.readJson(this.historyFile) as ChangeHistory[];
    history.push(change);
    await fs.writeJson(this.historyFile, history, { spaces: 2 });
  }

  /**
   * Generate processing ID for metadata version
   */
  private generateProcessingId(): string {
    const now = new Date();
    const date = now.getFullYear().toString() + 
                 (now.getMonth() + 1).toString().padStart(2, '0') + 
                 now.getDate().toString().padStart(2, '0');
    const time = now.getHours().toString().padStart(2, '0') + 
                 now.getMinutes().toString().padStart(2, '0') + 
                 now.getSeconds().toString().padStart(2, '0');
    return `proc_${date}_${time}`;
  }

  /**
   * Transform video title according to configuration
   */
  private transformTitle(originalTitle: string, recordingDate?: string): string {
    if (!recordingDate) {
      getLogger().warning('No recording date available for title transformation');
      return originalTitle;
    }

    try {
      const pattern = new RegExp(this.config.titleTransform.pattern);
      const replacement = this.config.titleTransform.replacement;
      
      // Replace date placeholders in replacement string
      const dateObj = new Date(recordingDate);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const day = dateObj.getDate().toString().padStart(2, '0');
      
      let result = replacement
        .replace(/\$1/g, year.toString())
        .replace(/\$2/g, month)
        .replace(/\$3/g, day);

      // Apply the regex replacement
      result = originalTitle.replace(pattern, result);
      
      logVerbose(`Title transformed: "${originalTitle}" → "${result}"`);
      return result;
    } catch (error) {
      getLogger().error('Title transformation failed', error as Error);
      return originalTitle;
    }
  }

  /**
   * Transform video description according to configuration
   */
  private transformDescription(originalDesc: string, recordingDate?: string): string {
    if (!recordingDate) {
      getLogger().warning('No recording date available for description transformation');
      return originalDesc;
    }

    try {
      const pattern = new RegExp(this.config.descriptionTransform.pattern);
      const replacement = this.config.descriptionTransform.replacement;
      
      // Replace date placeholders in replacement string
      const dateObj = new Date(recordingDate);
      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const day = dateObj.getDate().toString().padStart(2, '0');
      const hour = dateObj.getHours().toString().padStart(2, '0');
      const minute = dateObj.getMinutes().toString().padStart(2, '0');
      
      let result = replacement
        .replace(/\$1/g, year.toString())
        .replace(/\$2/g, month)
        .replace(/\$3/g, day)
        .replace(/\$4/g, hour)
        .replace(/\$5/g, minute);

      // Apply the regex replacement
      result = originalDesc.replace(pattern, result);
      
      // Add metadata version tag
      const processingId = this.generateProcessingId();
      const metadataTag = `[metadata ${this.config.metadataVersion}: ${processingId}]`;
      
      // Check if metadata tag already exists
      if (!result.includes('[metadata')) {
        result += ` ${metadataTag}`;
      }
      
      logVerbose(`Description transformed: "${originalDesc}" → "${result}"`);
      return result;
    } catch (error) {
      getLogger().error('Description transformation failed', error as Error);
      return originalDesc;
    }
  }

  /**
   * Generate tags for video
   */
  private generateTags(title: string): string[] {
    const tags = [...this.config.baseTags];
    
    // Extract dynamic tags from title (simple keyword extraction)
    const words = title.toLowerCase().split(/\s+/);
    const dynamicTags: string[] = [];
    
    // Add some common gaming keywords as dynamic tags
    const gamingKeywords = ['gameplay', 'walkthrough', 'review', 'tutorial', 'guide', 'tips', 'tricks'];
    for (const keyword of gamingKeywords) {
      if (words.includes(keyword) && dynamicTags.length < this.config.maxDynamicTags) {
        dynamicTags.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
      }
    }
    
    // Add game-specific keywords
    if (title.toLowerCase().includes('division')) {
      dynamicTags.push('The Division');
    }
    if (title.toLowerCase().includes('dark zone') || title.toLowerCase().includes('dz')) {
      dynamicTags.push('Dark Zone');
    }
    
    // Combine and deduplicate
    const allTags = [...tags, ...dynamicTags];
    const uniqueTags = Array.from(new Set(allTags));
    
    logVerbose(`Generated tags: ${uniqueTags.join(', ')}`);
    return uniqueTags;
  }

  /**
   * Check if video needs processing
   */
  private needsProcessing(video: LocalVideo): boolean {
    // If force flag is used, always process
    if (process.argv.includes('--force')) {
      return true;
    }
    
    // Check if video already has current metadata version
    if (video.metadataVersion === this.config.metadataVersion) {
      logVerbose(`Video ${video.id} already has metadata version ${this.config.metadataVersion}`);
      return false;
    }
    
    return true;
  }

  /**
   * Process a single video
   */
  private async processVideo(video: LocalVideo, options: ProcessingOptions): Promise<boolean> {
    try {
      logVerbose(`Processing video: ${video.id} - "${video.title}"`);
      
      // Check if processing is needed
      if (!this.needsProcessing(video)) {
        logVerbose(`Skipping video ${video.id} - already processed`);
        return true;
      }
      
      // Backup current state
      await this.backupVideo(video.id, video);
      
      // Transform title and description
      const newTitle = this.transformTitle(video.title, video.recordingDate);
      const newDescription = this.transformDescription(video.description, video.recordingDate);
      const newTags = this.generateTags(newTitle);
      
      // Prepare video settings
      const videoSettings: any = {
        title: newTitle,
        description: newDescription,
        tags: newTags,
        categoryId: this.config.videoSettings.categoryId,
        madeForKids: this.config.videoSettings.madeForKids,
        license: this.config.videoSettings.license
      };
      
      // Only add recordingDate if it's defined
      if (video.recordingDate) {
        videoSettings.recordingDate = video.recordingDate;
      }
      
      if (options.dryRun) {
        getLogger().info(`[DRY RUN] Would update video ${video.id}:`);
        getLogger().info(`  Title: "${video.title}" → "${newTitle}"`);
        getLogger().info(`  Description: "${video.description}" → "${newDescription}"`);
        getLogger().info(`  Tags: [${video.tags?.join(', ') || 'none'}] → [${newTags.join(', ')}]`);
        return true;
      }
      
      // Update video via YouTube API
      await this.youtubeClient.updateVideo(video.id, videoSettings);
      
      // Update change history
      await this.updateHistory({
        date: new Date().toISOString(),
        videoId: video.id,
        field: 'title',
        oldValue: video.title,
        newValue: newTitle
      });
      
      await this.updateHistory({
        date: new Date().toISOString(),
        videoId: video.id,
        field: 'description',
        oldValue: video.description,
        newValue: newDescription
      });
      
      getLogger().info(`Successfully updated video ${video.id}`);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      getLogger().error(`Failed to process video ${video.id}: ${errorMessage}`, error as Error);
      return false;
    }
  }

  /**
   * Process multiple videos
   */
  async processVideos(videos: LocalVideo[], options: ProcessingOptions): Promise<ProcessingResult> {
    const startTime = Date.now();
    const result: ProcessingResult = {
      processedVideos: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      errors: [],
      processingTime: ''
    };

    await this.initializeBackup();
    
    getLogger().info(`Starting to process ${videos.length} videos...`);
    
    for (const video of videos) {
      result.processedVideos++;
      
      try {
        const success = await this.processVideo(video, options);
        if (success) {
          result.successfulUpdates++;
        } else {
          result.failedUpdates++;
          result.errors.push({
            videoId: video.id,
            error: 'Processing failed',
            attempts: 1
          });
        }
      } catch (error) {
        result.failedUpdates++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          videoId: video.id,
          error: errorMessage,
          attempts: 1
        });
      }
      
      // Progress update every 10 videos
      if (result.processedVideos % 10 === 0) {
        getLogger().info(`Progress: ${result.processedVideos}/${videos.length} videos processed`);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    result.processingTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    return result;
  }
}

async function main(): Promise<void> {
  const program = new Command();
  
  program
    .name('process-videos')
    .description('Process and update video metadata')
    .option('-i, --input <file>', 'Input file with filtered videos (JSON)')
    .option('-v, --video-id <id>', 'Process specific video by ID')
    .option('--dry-run', 'Show what would be changed without making API calls')
    .option('--force', 'Force processing even if metadata version matches')
    .option('--verbose', 'Enable verbose logging')
    .parse();

  const options: ProcessingOptions = program.opts();
  
  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }
  
  try {
    // Load configuration
    const config = await loadConfig();
    
    // Initialize YouTube client
    const youtubeClient = new YouTubeClient(
      config.youtube.apiKey,
      config.youtube.clientId,
      config.youtube.clientSecret,
      config.youtube.channelId
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
    
    // Initialize processor
    const processor = new VideoProcessor(youtubeClient, config.videoProcessing);
    
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
      // Process filtered videos
      if (!await fs.pathExists(options.input)) {
        getLogger().error(`Input file ${options.input} not found`);
        process.exit(1);
      }
      videos = await fs.readJson(options.input) as LocalVideo[];
    } else {
      getLogger().error('Either --input or --video-id must be specified');
      process.exit(1);
    }
    
    if (videos.length === 0) {
      getLogger().info('No videos to process');
      return;
    }
    
    // Process videos
    const result = await processor.processVideos(videos, options);
    
    // Output results
    getLogger().info('Processing completed:');
    getLogger().info(`  Total videos: ${result.processedVideos}`);
    getLogger().info(`  Successful updates: ${result.successfulUpdates}`);
    getLogger().info(`  Failed updates: ${result.failedUpdates}`);
    getLogger().info(`  Processing time: ${result.processingTime}`);
    
    if (result.errors.length > 0) {
      getLogger().info('Errors:');
      for (const error of result.errors) {
        getLogger().info(`  ${error.videoId}: ${error.error}`);
      }
    }
    
    // Save results to file
    const resultsFile = `processing-results-${new Date().toISOString().split('T')[0]}.json`;
    await fs.writeJson(resultsFile, result, { spaces: 2 });
    getLogger().info(`Results saved to ${resultsFile}`);
    
  } catch (error) {
    getLogger().error('Processing failed', error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    getLogger().error('Unhandled error', error as Error);
    process.exit(1);
  });
} 