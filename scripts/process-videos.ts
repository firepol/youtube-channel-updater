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
import { getLogger, logVerbose, initializeLogger } from '../src/utils/logger';
import { VideoFilter, FilterRule } from './filter-videos';

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
  dryRunMode?: boolean;
  previewReport?: DryRunPreview;
}

interface ProcessingOptions {
  input?: string;
  videoId?: string;
  dryRun: boolean;
  force: boolean;
  verbose: boolean;
  output?: string; // Output file for dry-run reports
  // Filtering options
  filterConfig?: string; // Filter configuration file
  privacyStatus?: string; // Direct privacy status filter
  publishedAfter?: string; // Direct date filter
  publishedBefore?: string; // Direct date filter
  titleContains?: string; // Direct title filter
  descriptionContains?: string; // Direct description filter
  minViews?: number; // Direct views filter
  maxViews?: number; // Direct views filter
}

interface DryRunPreview {
  mode: 'dry-run';
  timestamp: string;
  summary: {
    videosToProcess: number;
    estimatedApiQuota: number;
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
    processing: {
      status: 'pending' | 'completed';
      videosToUpdate: number;
      estimatedQuota: number;
    };
  };
  preview: Array<{
    videoId: string;
    currentState: {
      title: string;
      description: string;
      tags: string[];
      recordingDate?: string;
      metadataVersion?: string;
    };
    proposedState: {
      title: string;
      description: string;
      tags: string[];
      recordingDate?: string;
      metadataVersion: string;
    };
    changes: {
      titleChanged: boolean;
      descriptionChanged: boolean;
      tagsChanged: boolean;
      recordingDateChanged: boolean;
      metadataVersionAdded: boolean;
    };
    validation: {
      titleValid: boolean;
      descriptionValid: boolean;
      tagsValid: boolean;
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
   * Apply a sequence of regex transforms to a string
   */
  private applyTransforms(source: string, transforms: { pattern: string; replacement: string }[]): string {
    let result = source;
    if (!Array.isArray(transforms)) return result;
    for (const { pattern, replacement } of transforms) {
      const regex = new RegExp(pattern);
      const match = result.match(regex);
      logVerbose(`[DEBUG] Applying pattern: ${pattern}`);
      logVerbose(`[DEBUG] Source string: '${result}'`);
      logVerbose(`[DEBUG] Match result: ${!!(Array.isArray(match) && match.length > 0)}`);
      if (Array.isArray(match) && match.length > 0) {
        let replaced = replacement;
        for (let i = 1; i < match.length; i++) {
          const group = typeof match[i] === 'string' ? match[i] : '';
          replaced = replaced.replace(new RegExp(`\\$${i}`, 'g'), group);
        }
        result = result.replace(regex, replaced);
      }
    }
    return result;
  }

  /**
   * Transform video title using multi-step transforms from config
   */
  private transformTitle(originalTitle: string, recordingDate?: string): string {
    const transforms: { pattern: string; replacement: string }[] = Array.isArray(this.config.titleTransforms)
      ? this.config.titleTransforms
      : this.config.titleTransform ? [this.config.titleTransform] : [];
    if (!Array.isArray(transforms)) return originalTitle;
    if (!recordingDate) {
      getLogger().warning('No recording date available for title transformation');
      return this.applyTransforms(originalTitle, transforms);
    }
    return this.applyTransforms(originalTitle, transforms);
  }

  /**
   * Transform video description using multi-step transforms from config
   */
  private transformDescription(originalDesc: string, originalTitle: string, recordingDate?: string): string {
    const transforms: { pattern: string; replacement: string }[] = Array.isArray(this.config.descriptionTransforms)
      ? this.config.descriptionTransforms
      : this.config.descriptionTransform ? [this.config.descriptionTransform] : [];
    if (!Array.isArray(transforms)) return originalDesc;
    const source = (!originalDesc || originalDesc.trim() === '') ? originalTitle : originalDesc;
    let result = this.applyTransforms(source, transforms);
    const metadataTag = `\n\n[metadata ${this.config.metadataVersion}: ${this.generateProcessingId()}]`;
    if (!result.includes('[metadata')) {
      result += metadataTag;
    }
    logVerbose(`Description transformed: "${source}" → "${result}"`);
    return result;
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
    
    // Combine and deduplicate tags
    const allTags = [...tags, ...dynamicTags];
    const uniqueTags = [...new Set(allTags)];
    
    // Limit to reasonable number of tags (YouTube allows up to 500 characters total)
    return uniqueTags.slice(0, 20); // Limit to 20 tags for safety
  }

  /**
   * Check if video needs processing
   */
  private needsProcessing(video: LocalVideo): boolean {
    // Check if video already has current metadata version
    if (video.description && video.description.includes(`[metadata ${this.config.metadataVersion}:`)) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check title transformation pattern(s)
    if (Array.isArray(this.config.titleTransforms) && this.config.titleTransforms.length > 0) {
      for (const t of this.config.titleTransforms) {
        try {
          new RegExp(t.pattern);
        } catch (error) {
          errors.push(`Invalid title transformation pattern: ${t.pattern}`);
        }
      }
    } else if (this.config.titleTransform) {
      try {
        new RegExp(this.config.titleTransform.pattern);
      } catch (error) {
        errors.push(`Invalid title transformation pattern: ${this.config.titleTransform.pattern}`);
      }
    } else {
      errors.push('No title transformation pattern(s) configured');
    }

    // Check description transformation pattern(s)
    if (Array.isArray(this.config.descriptionTransforms) && this.config.descriptionTransforms.length > 0) {
      for (const t of this.config.descriptionTransforms) {
        try {
          new RegExp(t.pattern);
        } catch (error) {
          errors.push(`Invalid description transformation pattern: ${t.pattern}`);
        }
      }
    } else if (this.config.descriptionTransform) {
      try {
        new RegExp(this.config.descriptionTransform.pattern);
      } catch (error) {
        errors.push(`Invalid description transformation pattern: ${this.config.descriptionTransform.pattern}`);
      }
    } else {
      errors.push('No description transformation pattern(s) configured');
    }

    // Check base tags
    if (!this.config.baseTags || this.config.baseTags.length === 0) {
      warnings.push('No base tags configured');
    }

    // Check metadata version
    if (!this.config.metadataVersion) {
      errors.push('Metadata version not configured');
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
    const videosToUpdate = videos.filter(v => this.needsProcessing(v)).length;
    const apiCallsRequired = videosToUpdate; // 1 API call per video update
    const quotaUnitsRequired = videosToUpdate * 50; // 50 units per video update
    const dailyQuotaImpact = (quotaUnitsRequired / 10000) * 100; // Percentage of daily quota
    const processingTimeEstimate = `${Math.ceil(videosToUpdate / 10)}:${(videosToUpdate % 10 * 6).toString().padStart(2, '0')}`; // Rough estimate

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
   * Extract recording date from title using a regex pattern from config
   */
  private extractRecordingDateFromTitle(title: string): string | undefined {
    const pattern = this.config.recordingDateExtractPattern
      ? new RegExp(this.config.recordingDateExtractPattern)
      : /(?<year>\d{4})[ .-]?(?<month>\d{2})[ .-]?(?<day>\d{2})[ .-]+(?<hour>\d{2})[ .-]?(?<minute>\d{2})[ .-]?(?<second>\d{2})[ .-]?(?<centisecond>\d{2})/;
    const match = title.match(pattern);
    if (match && match.groups) {
      const { year, month, day, hour, minute, second, centisecond } = match.groups;
      if (year && month && day && hour && minute) {
        // Build ISO string (centisecond optional)
        return `${year}-${month}-${day}T${hour}:${minute}:${second || '00'}.${centisecond || '000'}Z`;
      }
    }
    return undefined;
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
      let recordingDate = video.recordingDate;
      let extractedRecordingDate: string | undefined = undefined;
      if (!recordingDate) {
        extractedRecordingDate = this.extractRecordingDateFromTitle(video.title);
        recordingDate = extractedRecordingDate;
      }
      const newTitle = this.transformTitle(video.title, recordingDate);
      const newDescription = this.transformDescription(video.description, video.title, recordingDate);
      const newTags = this.generateTags(video.title);
      const processingId = this.generateProcessingId();
      const newMetadataVersion = `[metadata ${this.config.metadataVersion}: ${processingId}]`;

      // Validate individual video transformations
      const titleValid = newTitle.length <= 100; // YouTube title limit
      const descriptionValid = newDescription.length <= 5000; // YouTube description limit
      const tagsValid = newTags.length <= 500; // YouTube tag limit

      const videoWarnings: string[] = [];
      const videoErrors: string[] = [];

      if (!titleValid) videoErrors.push('Title exceeds 100 character limit');
      if (!descriptionValid) videoErrors.push('Description exceeds 5000 character limit');
      if (!tagsValid) videoErrors.push('Too many tags');

      const currentState: any = {
        title: video.title,
        description: video.description,
        tags: video.tags || [],
        metadataVersion: video.description?.includes('[metadata') ? 'existing' : undefined
      };
      if (video.recordingDate) {
        currentState.recordingDate = video.recordingDate;
      }
      const proposedState: any = {
        title: newTitle,
        description: newDescription,
        tags: newTags,
        metadataVersion: newMetadataVersion
      };
      // Always set recordingDate in proposedState if extracted
      if (recordingDate) {
        proposedState.recordingDate = recordingDate;
      }

      return {
        videoId: video.id,
        currentState,
        proposedState,
        changes: {
          titleChanged: newTitle !== video.title,
          descriptionChanged: newDescription !== video.description,
          tagsChanged: JSON.stringify(newTags) !== JSON.stringify(video.tags || []),
          recordingDateChanged: (recordingDate && recordingDate !== video.recordingDate) || false,
          metadataVersionAdded: !video.description?.includes('[metadata')
        },
        validation: {
          titleValid,
          descriptionValid,
          tagsValid,
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
        processing: {
          status: 'completed',
          videosToUpdate: quotaEstimate.apiCallsRequired,
          estimatedQuota: quotaEstimate.quotaUnitsRequired
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
          memory: '~50MB',
          storage: '~2MB'
        }
      }
    };
  }

  /**
   * Process a single video
   */
  private async processVideo(video: LocalVideo, options: ProcessingOptions): Promise<boolean> {
    try {
      // Check if video needs processing
      if (!options.force && !this.needsProcessing(video)) {
        logVerbose(`Skipping video ${video.id} - already processed with current metadata version`);
        return true;
      }

      let recordingDate = video.recordingDate;
      if (!recordingDate) {
        recordingDate = this.extractRecordingDateFromTitle(video.title);
      }

      // Transform video metadata
      const newTitle = this.transformTitle(video.title, recordingDate);
      const newDescription = this.transformDescription(video.description, video.title, recordingDate);
      const newTags = this.generateTags(video.title);

      // Prepare video settings
      const videoSettings: any = {
        title: newTitle,
        description: newDescription,
        tags: newTags,
        categoryId: '20', // Gaming
        madeForKids: false,
        license: 'creativeCommon',
        embeddable: true,
        publicStatsViewable: true,
        shortsRemixing: 'allow'
      };

      // Only add recordingDate if it's defined
      if (recordingDate) {
        videoSettings.recordingDate = recordingDate;
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

    // If dry-run mode, generate comprehensive preview
    if (options.dryRun) {
      result.dryRunMode = true;
      result.previewReport = await this.generateDryRunPreview(videos);
      
      // Display preview summary
      const preview = result.previewReport;
      getLogger().info('=== DRY RUN PREVIEW ===');
      getLogger().info(`Videos to process: ${preview.summary.videosToProcess}`);
      getLogger().info(`Estimated API quota: ${preview.summary.estimatedApiQuota} units`);
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
        getLogger().info(`Video: ${video.videoId}`);
        getLogger().info(`  Title: "${video.currentState.title}" → "${video.proposedState.title}"`);
        getLogger().info(`  Description: "${video.currentState.description}" → "${video.proposedState.description}"`);
        getLogger().info(`  Tags: [${video.currentState.tags.join(', ')}] → [${video.proposedState.tags.join(', ')}]`);
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

export { VideoProcessor };

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
    .option('-o, --output <file>', 'Output file for dry-run reports')
    .option('--filter-config <file>', 'Filter configuration file')
    .option('--privacy-status <status>', 'Direct privacy status filter')
    .option('--published-after <date>', 'Direct date filter')
    .option('--published-before <date>', 'Direct date filter')
    .option('--title-contains <text>', 'Direct title filter')
    .option('--description-contains <text>', 'Direct description filter')
    .option('--min-views <number>', 'Direct views filter')
    .option('--max-views <number>', 'Direct views filter')
    .parse();

  const options: ProcessingOptions = program.opts();
  
  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }
  
  try {
    // Load configuration
    const config = await loadConfig();

    // Initialize logger
    initializeLogger({
      verbose: options.verbose ? true : config.app.verbose,
      logLevel: options.verbose ? 'verbose' : (config.app.logLevel as any),
      logsDir: config.paths.logsDir
    });
    logVerbose('TEST VERBOSE LOG');
    
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
      // Process filtered videos from input file
      if (!await fs.pathExists(options.input)) {
        getLogger().error(`Input file ${options.input} not found`);
        process.exit(1);
      }
      videos = await fs.readJson(options.input) as LocalVideo[];
    } else if (options.filterConfig || options.privacyStatus || options.publishedAfter || 
               options.publishedBefore || options.titleContains || options.descriptionContains || 
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
        addFilter('description_contains', options.descriptionContains);
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
      getLogger().error('Either --input, --video-id, --filter-config, or direct filter options must be specified');
      getLogger().error('Use --help for available filtering options');
      process.exit(1);
    }
    
    if (videos.length === 0) {
      getLogger().info('No videos to process');
      return;
    }
    
    // Process videos
    const result = await processor.processVideos(videos, options);
    
    // Output results
    if (!options.dryRun) {
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
      const logsDir = path.join('logs');
      await fs.ensureDir(logsDir);
      const resultsFile = path.join(logsDir, `processing-results-${new Date().toISOString().split('T')[0]}.json`);
      await fs.writeJson(resultsFile, result, { spaces: 2 });
      getLogger().info(`Results saved to ${resultsFile}`);
    }
    
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