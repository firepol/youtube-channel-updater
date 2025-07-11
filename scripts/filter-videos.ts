#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { Command } from 'commander';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { LocalVideo } from '../src/types/api-types';

// Filter rule interface
export interface FilterRule {
  type: string;
  value: string | number | boolean;
  caseSensitive?: boolean;
}

// Filter result interface
export interface FilterResult {
  videoId: string;
  title: string;
  description: string;
  matchedRules: string[];
  recordingDate?: string | undefined;
  privacyStatus: string;
  uploadStatus?: string | undefined;
  processingStatus?: string | undefined;
  statistics?: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  } | undefined;
  lastUpdated?: string;
}

// Filter configuration interface
interface FilterConfig {
  enabled: boolean;
  filters: FilterRule[];
}

// Main filter configuration interface
interface MainFilterConfig {
  [key: string]: FilterConfig;
}

export class VideoFilter {
  private config: any;
  private logger: any;
  private videos: LocalVideo[] = [];

  constructor() {
    // Do not call this.initialize() here!
  }

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

      // Load video database
      await this.loadVideoDatabase();

      this.logger.info('Video filter initialized');
    } catch (error) {
      console.error('Failed to initialize video filter:', error);
      process.exit(1);
    }
  }

  /**
   * Load video database from file
   */
  private async loadVideoDatabase(): Promise<void> {
    try {
      const videosPath = this.config.paths.videosDb;
      
      if (!await fs.pathExists(videosPath)) {
        throw new Error(`Video database not found at ${videosPath}. Please run build-video-database.ts first.`);
      }

      this.videos = await fs.readJson(videosPath);
      this.logger.info(`Loaded ${this.videos.length} videos from database`);
    } catch (error) {
      this.logger.error('Failed to load video database', error as Error);
      throw error;
    }
  }

  /**
   * Apply text filter (contains/not contains)
   */
  private applyTextFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value, caseSensitive = false } = rule;
    const searchValue = caseSensitive ? value : (value as string).toLowerCase();
    
    let fieldValue: string = '';
    let fieldName: string = '';

    switch (type) {
      case 'title_contains':
        fieldValue = video.title;
        fieldName = 'title';
        break;
      case 'title_not_contains':
        fieldValue = video.title;
        fieldName = 'title';
        break;
      case 'description_contains':
        fieldValue = video.description;
        fieldName = 'description';
        break;
      case 'description_not_contains':
        fieldValue = video.description;
        fieldName = 'description';
        break;
      case 'tags_contains':
        fieldValue = (video.tags || []).join(' ');
        fieldName = 'tags';
        break;
      case 'tags_not_contains':
        fieldValue = (video.tags || []).join(' ');
        fieldName = 'tags';
        break;
      default:
        return false;
    }

    if (!caseSensitive) {
      fieldValue = fieldValue.toLowerCase();
    }

    const contains = fieldValue.includes(searchValue as string);
    return type.endsWith('_not_contains') ? !contains : contains;
  }

  /**
   * Apply status filter
   */
  private applyStatusFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    
    switch (type) {
      case 'privacy_status':
        return video.privacyStatus === value;
      case 'privacy_status_not':
        return video.privacyStatus !== value;
      case 'upload_status':
        return video.uploadStatus === value;
      case 'upload_status_not':
        return video.uploadStatus !== value;
      case 'processing_status':
        return video.processingStatus === value;
      case 'processing_status_not':
        return video.processingStatus !== value;
      case 'made_for_kids':
        return video.madeForKids === value;
      case 'made_for_kids_not':
        return video.madeForKids !== value;
      case 'embeddable':
        return video.embeddable === value;
      case 'embeddable_not':
        return video.embeddable !== value;
      case 'public_stats_viewable':
        return video.publicStatsViewable === value;
      case 'public_stats_viewable_not':
        return video.publicStatsViewable !== value;
      default:
        return false;
    }
  }

  /**
   * Apply date filter
   */
  private applyDateFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    const filterDate = new Date(value as string);
    
    let videoDate: Date | undefined;
    
    switch (type) {
      case 'published_after':
      case 'published_before':
      case 'published_not_after':
      case 'published_not_before':
        videoDate = new Date(video.publishedAt);
        break;
      case 'recording_date_after':
      case 'recording_date_before':
      case 'recording_date_not_after':
      case 'recording_date_not_before':
        videoDate = video.recordingDate ? new Date(video.recordingDate) : undefined;
        break;
      case 'last_processed_after':
      case 'last_processed_before':
      case 'last_processed_not_after':
      case 'last_processed_not_before':
        videoDate = video.lastProcessed ? new Date(video.lastProcessed) : undefined;
        break;
      default:
        return false;
    }

    if (!videoDate) {
      return false;
    }

    switch (type) {
      case 'published_after':
      case 'recording_date_after':
      case 'last_processed_after':
        return videoDate > filterDate;
      case 'published_before':
      case 'recording_date_before':
      case 'last_processed_before':
        return videoDate < filterDate;
      case 'published_not_after':
      case 'recording_date_not_after':
      case 'last_processed_not_after':
        return videoDate <= filterDate;
      case 'published_not_before':
      case 'recording_date_not_before':
      case 'last_processed_not_before':
        return videoDate >= filterDate;
      default:
        return false;
    }
  }

  /**
   * Apply statistics filter
   */
  private applyStatisticsFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    const stats = video.statistics;
    
    if (!stats) {
      return false;
    }

    const numValue = Number(value);
    let videoValue: number;

    switch (type) {
      case 'min_views':
      case 'max_views':
      case 'views_not_min':
      case 'views_not_max':
        videoValue = parseInt(stats.viewCount || '0', 10);
        break;
      case 'min_likes':
      case 'max_likes':
      case 'likes_not_min':
      case 'likes_not_max':
        videoValue = parseInt(stats.likeCount || '0', 10);
        break;
      case 'min_comments':
      case 'max_comments':
      case 'comments_not_min':
      case 'comments_not_max':
        videoValue = parseInt(stats.commentCount || '0', 10);
        break;
      default:
        return false;
    }

    switch (type) {
      case 'min_views':
      case 'min_likes':
      case 'min_comments':
        return videoValue >= numValue;
      case 'max_views':
      case 'max_likes':
      case 'max_comments':
        return videoValue <= numValue;
      case 'views_not_min':
      case 'likes_not_min':
      case 'comments_not_min':
        return videoValue < numValue;
      case 'views_not_max':
      case 'likes_not_max':
      case 'comments_not_max':
        return videoValue > numValue;
      default:
        return false;
    }
  }

  /**
   * Apply content filter
   */
  private applyContentFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    
    switch (type) {
      case 'category_id':
        return video.categoryId === value;
      case 'category_id_not':
        return video.categoryId !== value;
      case 'license':
        return video.license === value;
      case 'license_not':
        return video.license !== value;
      case 'definition':
        return video.definition === value;
      case 'definition_not':
        return video.definition !== value;
      case 'caption':
        return video.caption === value;
      case 'caption_not':
        return video.caption !== value;
      case 'default_language':
        return video.defaultLanguage === value;
      case 'default_language_not':
        return video.defaultLanguage !== value;
      case 'default_audio_language':
        return video.defaultAudioLanguage === value;
      case 'default_audio_language_not':
        return video.defaultAudioLanguage !== value;
      default:
        return false;
    }
  }

  /**
   * Apply metadata filter
   */
  private applyMetadataFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    
    switch (type) {
      case 'metadata_version':
        return video.metadataVersion === value;
      case 'metadata_version_not':
        return video.metadataVersion !== value;
      case 'has_metadata_version':
        return value ? !!video.metadataVersion : !video.metadataVersion;
      case 'has_metadata_version_not':
        return value ? !video.metadataVersion : !!video.metadataVersion;
      case 'has_recording_date':
        return value ? !!video.recordingDate : !video.recordingDate;
      case 'has_recording_date_not':
        return value ? !video.recordingDate : !!video.recordingDate;
      case 'has_tags':
        return value ? !!(video.tags && video.tags.length > 0) : !(video.tags && video.tags.length > 0);
      case 'has_tags_not':
        return value ? !(video.tags && video.tags.length > 0) : !!(video.tags && video.tags.length > 0);
      default:
        return false;
    }
  }

  /**
   * Apply processing filter
   */
  private applyProcessingFilter(video: LocalVideo, rule: FilterRule): boolean {
    const { type, value } = rule;
    
    switch (type) {
      case 'needs_processing':
        return value ? !video.metadataVersion : !!video.metadataVersion;
      case 'needs_processing_not':
        return value ? !!video.metadataVersion : !video.metadataVersion;
      case 'already_processed':
        return value ? !!video.metadataVersion : !video.metadataVersion;
      case 'already_processed_not':
        return value ? !video.metadataVersion : !!video.metadataVersion;
      case 'processing_failed':
        return value ? !!video.processingErrors : !video.processingErrors;
      case 'processing_failed_not':
        return value ? !video.processingErrors : !!video.processingErrors;
      case 'has_processing_errors':
        return value ? !!video.processingErrors : !video.processingErrors;
      case 'has_processing_errors_not':
        return value ? !video.processingErrors : !!video.processingErrors;
      default:
        return false;
    }
  }

  /**
   * Apply a single filter rule to a video
   */
  private applyFilterRule(video: LocalVideo, rule: FilterRule): boolean {
    const { type } = rule;

    // Text filters
    if (type.includes('_contains') || type.includes('_not_contains')) {
      return this.applyTextFilter(video, rule);
    }

    // Status filters
    if (type.includes('_status') || type.includes('_kids') || type.includes('embeddable') || type.includes('public_stats_viewable')) {
      return this.applyStatusFilter(video, rule);
    }

    // Date filters
    if (type.includes('_after') || type.includes('_before')) {
      return this.applyDateFilter(video, rule);
    }

    // Statistics filters
    if (type.includes('_views') || type.includes('_likes') || type.includes('_comments')) {
      return this.applyStatisticsFilter(video, rule);
    }

    // Content filters
    if (type.includes('category_id') || type.includes('license') || type.includes('definition') || 
        type.includes('caption') || type.includes('default_language') || type.includes('default_audio_language')) {
      return this.applyContentFilter(video, rule);
    }

    // Metadata filters
    if (type.includes('metadata_version') || type.includes('has_metadata_version') || 
        type.includes('has_recording_date') || type.includes('has_tags')) {
      return this.applyMetadataFilter(video, rule);
    }

    // Processing filters
    if (type.includes('needs_processing') || type.includes('already_processed') || 
        type.includes('processing_failed') || type.includes('has_processing_errors')) {
      return this.applyProcessingFilter(video, rule);
    }

    return false;
  }

  /**
   * Apply multiple filter rules to videos (AND logic)
   */
  public applyFilters(videos: LocalVideo[], rules: FilterRule[]): LocalVideo[] {
    return videos.filter(video => {
      return rules.every(rule => this.applyFilterRule(video, rule));
    });
  }

  /**
   * Convert video to filter result
   */
  public convertToFilterResult(video: LocalVideo, matchedRules: string[]): FilterResult {
    return {
      videoId: video.id,
      title: video.title,
      description: video.description,
      matchedRules,
      recordingDate: video.recordingDate,
      privacyStatus: video.privacyStatus,
      uploadStatus: video.uploadStatus,
      processingStatus: video.processingStatus,
      statistics: video.statistics,
      lastUpdated: video.lastUpdated
    };
  }

  /**
   * Filter videos based on command line arguments
   */
  async filterFromArgs(filters: FilterRule[], preview: boolean = false): Promise<void> {
    try {
      this.logger.info(`Applying ${filters.length} filter(s) to ${this.videos.length} videos...`);

      // Apply filters
      const filteredVideos = this.applyFilters(this.videos, filters);

      // Convert to results
      const results = filteredVideos.map(video => 
        this.convertToFilterResult(video, filters.map(f => f.type))
      );

      // Display results
      if (preview) {
        this.displayPreview(filters, results);
      } else {
        this.displayResults(filters, results);
      }

      this.logger.success(`Found ${results.length} videos matching criteria`);
    } catch (error) {
      this.logger.error('Failed to filter videos', error as Error);
      throw error;
    }
  }

  /**
   * Filter videos from configuration file
   */
  async filterFromConfig(configPath: string, preview: boolean = false): Promise<void> {
    try {
      if (!await fs.pathExists(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      const config: MainFilterConfig = await fs.readJson(configPath);
      this.logger.info(`Loaded filter configuration from ${configPath}`);

      for (const [filterName, filterConfig] of Object.entries(config)) {
        if (!filterConfig.enabled) {
          this.logger.info(`Skipping disabled filter: ${filterName}`);
          continue;
        }

        this.logger.info(`Applying filter: ${filterName}`);
        await this.filterFromArgs(filterConfig.filters, preview);
      }
    } catch (error) {
      this.logger.error('Failed to filter from configuration', error as Error);
      throw error;
    }
  }

  /**
   * Display preview results
   */
  private displayPreview(filters: FilterRule[], results: FilterResult[]): void {
    console.log(`\nFound ${results.length} videos matching criteria:`);
    
    // Display filter criteria
    filters.forEach(filter => {
      console.log(`- ${filter.type}: "${filter.value}"`);
    });

    console.log('\nVideos to be processed:');
    
    // Display first 500 results
    const displayCount = Math.min(500, results.length);
    for (let i = 0; i < displayCount; i++) {
      const result = results[i];
      const views = result.statistics?.viewCount || '0';
      console.log(`${i + 1}. ${result.videoId}: "${result.title}" (${result.privacyStatus}, ${views} views)`);
    }

    if (results.length > displayCount) {
      console.log(`... and ${results.length - displayCount} more videos`);
    }
  }

  /**
   * Print a human-readable summary of filtered videos
   */
  private printVideoSummary(results: FilterResult[]): void {
    if (results.length === 0) {
      console.log('No videos matched the filter criteria.');
      return;
    }
    console.log(`Found ${results.length} videos matching criteria:`);
    results.forEach((video, idx) => {
      const views = video.statistics?.viewCount || '0';
      console.log(`${idx + 1}. ${video.videoId}: "${video.title}" (${video.privacyStatus}, ${views} views)`);
    });
  }

  /**
   * Display full results (optionally write to file)
   */
  public displayResults(filters: FilterRule[], results: FilterResult[], outputFile?: string, csvFile?: string): void {
    // Print human-readable summary
    this.printVideoSummary(results);
    // Prepare JSON output
    const output = {
      filterCriteria: filters,
      totalVideos: results.length,
      videos: results
    };
    // Write JSON to file if requested
    if (outputFile) {
      fs.writeJsonSync(outputFile, output, { spaces: 2 });
      console.log(`\nJSON results saved to ${outputFile}`);
    }
    // Write CSV to file if requested
    if (csvFile) {
      const CSV_HEADER = 'videoId,title,description,privacyStatus,recordingDate,lastUpdated';

      function toCsvRow(video: FilterResult): string {
        // Escape double quotes and replace newlines for CSV safety
        const escape = (val: string) => '"' + String(val ?? '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
        return [
          escape(video.videoId),
          escape(video.title),
          escape(video.description),
          escape(video.privacyStatus),
          escape(video.recordingDate ?? ''),
          escape(video.lastUpdated ?? '')
        ].join(',');
      }
      const csvRows = [CSV_HEADER, ...results.map(v => toCsvRow(v))];
      fs.writeFileSync(csvFile, csvRows.join('\n'));
      console.log(`CSV results saved to ${csvFile}`);
    }
  }

  /**
   * Get filtered videos as LocalVideo objects
   */
  async getFilteredVideos(filters: FilterRule[]): Promise<LocalVideo[]> {
    await this.initialize();
    return this.applyFilters(this.videos, filters);
  }

  /**
   * Get filtered videos as LocalVideo objects from config
   */
  async getFilteredVideosFromConfig(configPath: string): Promise<LocalVideo[]> {
    await this.initialize();
    
    try {
      const config = await fs.readJson(configPath) as MainFilterConfig;
      
      for (const [name, filterConfig] of Object.entries(config)) {
        if (filterConfig.enabled && filterConfig.filters.length > 0) {
          this.logger.info(`Applying filter configuration: ${name}`);
          return this.applyFilters(this.videos, filterConfig.filters);
        }
      }
      
      throw new Error('No enabled filter configuration found');
    } catch (error) {
      this.logger.error('Failed to filter from configuration', error as Error);
      throw error;
    }
  }
}

// Command line interface
async function main() {
  const program = new Command();
  const filter = new VideoFilter();

  program
    .name('filter-videos')
    .description('Filter YouTube videos based on various criteria')
    .version('1.0.0');

  // Text filters
  program.option('--title-contains <text>', 'Title contains text');
  program.option('--title-not-contains <text>', 'Title does not contain text');
  program.option('--description-contains <text>', 'Description contains text');
  program.option('--description-not-contains <text>', 'Description does not contain text');
  program.option('--tags-contains <text>', 'Tags contain text');
  program.option('--tags-not-contains <text>', 'Tags do not contain text');

  // Status filters
  program.option('--privacy-status <status>', 'Privacy status (private, public, unlisted)');
  program.option('--privacy-status-not <status>', 'Privacy status is not');
  program.option('--upload-status <status>', 'Upload status (uploaded, processing, failed, rejected)');
  program.option('--upload-status-not <status>', 'Upload status is not');
  program.option('--processing-status <status>', 'Processing status (succeeded, processing, failed)');
  program.option('--processing-status-not <status>', 'Processing status is not');
  program.option('--made-for-kids <boolean>', 'Made for kids setting');
  program.option('--made-for-kids-not <boolean>', 'Made for kids setting is not');
  program.option('--embeddable <boolean>', 'Embeddable setting');
  program.option('--embeddable-not <boolean>', 'Embeddable setting is not');
  program.option('--public-stats-viewable <boolean>', 'Public stats viewable setting');
  program.option('--public-stats-viewable-not <boolean>', 'Public stats viewable setting is not');

  // Date filters
  program.option('--published-after <date>', 'Published after date (YYYY-MM-DD)');
  program.option('--published-before <date>', 'Published before date (YYYY-MM-DD)');
  program.option('--published-not-after <date>', 'Published before or on date (YYYY-MM-DD)');
  program.option('--published-not-before <date>', 'Published after or on date (YYYY-MM-DD)');
  program.option('--recording-date-after <date>', 'Recording date after (YYYY-MM-DD)');
  program.option('--recording-date-before <date>', 'Recording date before (YYYY-MM-DD)');
  program.option('--recording-date-not-after <date>', 'Recording date before or on (YYYY-MM-DD)');
  program.option('--recording-date-not-before <date>', 'Recording date after or on (YYYY-MM-DD)');
  program.option('--last-processed-after <date>', 'Last processed after (YYYY-MM-DD)');
  program.option('--last-processed-before <date>', 'Last processed before (YYYY-MM-DD)');
  program.option('--last-processed-not-after <date>', 'Last processed before or on (YYYY-MM-DD)');
  program.option('--last-processed-not-before <date>', 'Last processed after or on (YYYY-MM-DD)');

  // Statistics filters
  program.option('--min-views <number>', 'Minimum view count');
  program.option('--max-views <number>', 'Maximum view count');
  program.option('--views-not-min <number>', 'View count less than');
  program.option('--views-not-max <number>', 'View count greater than');
  program.option('--min-likes <number>', 'Minimum like count');
  program.option('--max-likes <number>', 'Maximum like count');
  program.option('--likes-not-min <number>', 'Like count less than');
  program.option('--likes-not-max <number>', 'Like count greater than');
  program.option('--min-comments <number>', 'Minimum comment count');
  program.option('--max-comments <number>', 'Maximum comment count');
  program.option('--comments-not-min <number>', 'Comment count less than');
  program.option('--comments-not-max <number>', 'Comment count greater than');

  // Content filters
  program.option('--category-id <id>', 'Category ID');
  program.option('--category-id-not <id>', 'Category ID is not');
  program.option('--license <license>', 'License (youtube, creativeCommon)');
  program.option('--license-not <license>', 'License is not');
  program.option('--definition <definition>', 'Definition (hd, sd)');
  program.option('--definition-not <definition>', 'Definition is not');
  program.option('--caption <caption>', 'Caption availability (true, false)');
  program.option('--caption-not <caption>', 'Caption availability is not');
  program.option('--default-language <lang>', 'Default language code');
  program.option('--default-language-not <lang>', 'Default language code is not');
  program.option('--default-audio-language <lang>', 'Default audio language code');
  program.option('--default-audio-language-not <lang>', 'Default audio language code is not');

  // Metadata filters
  program.option('--metadata-version <version>', 'Metadata version');
  program.option('--metadata-version-not <version>', 'Metadata version is not');
  program.option('--has-metadata-version <boolean>', 'Has metadata version');
  program.option('--has-metadata-version-not <boolean>', 'Has metadata version is not');
  program.option('--has-recording-date <boolean>', 'Has recording date');
  program.option('--has-recording-date-not <boolean>', 'Has recording date is not');
  program.option('--has-tags <boolean>', 'Has tags');
  program.option('--has-tags-not <boolean>', 'Has tags is not');

  // Processing filters
  program.option('--needs-processing <boolean>', 'Needs processing');
  program.option('--needs-processing-not <boolean>', 'Needs processing is not');
  program.option('--already-processed <boolean>', 'Already processed');
  program.option('--already-processed-not <boolean>', 'Already processed is not');
  program.option('--processing-failed <boolean>', 'Processing failed');
  program.option('--processing-failed-not <boolean>', 'Processing failed is not');
  program.option('--has-processing-errors <boolean>', 'Has processing errors');
  program.option('--has-processing-errors-not <boolean>', 'Has processing errors is not');

  // General options
  program.option('--preview', 'Preview mode (show count without processing)');
  program.option('--config <path>', 'Use configuration file');
  program.option('--verbose', 'Verbose output');
  program.option('-o, --output <file>', 'Output file for JSON results');
  program.option('--csv <file>', 'Output file for CSV results');

  program.parse();

  const options = program.opts();

  await filter.initialize();

  try {
    // Handle configuration file
    if (options.config) {
      await filter.filterFromConfig(options.config, options.preview);
      return;
    }

    // Build filters from command line options
    const filters: FilterRule[] = [];

    // Helper function to add filter
    const addFilter = (type: string, value: any) => {
      if (value === undefined) return;
      // Convert string booleans to actual booleans
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      // Convert string numbers to actual numbers
      if (typeof value === 'string' && !isNaN(Number(value)) && 
          (type.includes('views') || type.includes('likes') || type.includes('comments'))) {
        value = Number(value);
      }
      filters.push({ type, value });
    };

    // Explicitly map CLI options to filter types
    addFilter('privacy_status', options.privacyStatus);
    addFilter('privacy_status_not', options.privacyStatusNot);
    addFilter('upload_status', options.uploadStatus);
    addFilter('upload_status_not', options.uploadStatusNot);
    addFilter('processing_status', options.processingStatus);
    addFilter('processing_status_not', options.processingStatusNot);
    addFilter('made_for_kids', options.madeForKids);
    addFilter('made_for_kids_not', options.madeForKidsNot);
    addFilter('embeddable', options.embeddable);
    addFilter('embeddable_not', options.embeddableNot);
    addFilter('public_stats_viewable', options.publicStatsViewable);
    addFilter('public_stats_viewable_not', options.publicStatsViewableNot);
    addFilter('title_contains', options.titleContains);
    addFilter('title_not_contains', options.titleNotContains);
    addFilter('description_contains', options.descriptionContains);
    addFilter('description_not_contains', options.descriptionNotContains);
    addFilter('tags_contains', options.tagsContains);
    addFilter('tags_not_contains', options.tagsNotContains);
    addFilter('published_after', options.publishedAfter);
    addFilter('published_before', options.publishedBefore);
    addFilter('published_not_after', options.publishedNotAfter);
    addFilter('published_not_before', options.publishedNotBefore);
    addFilter('recording_date_after', options.recordingDateAfter);
    addFilter('recording_date_before', options.recordingDateBefore);
    addFilter('recording_date_not_after', options.recordingDateNotAfter);
    addFilter('recording_date_not_before', options.recordingDateNotBefore);
    addFilter('last_processed_after', options.lastProcessedAfter);
    addFilter('last_processed_before', options.lastProcessedBefore);
    addFilter('last_processed_not_after', options.lastProcessedNotAfter);
    addFilter('last_processed_not_before', options.lastProcessedNotBefore);
    addFilter('min_views', options.minViews);
    addFilter('max_views', options.maxViews);
    addFilter('views_not_min', options.viewsNotMin);
    addFilter('views_not_max', options.viewsNotMax);
    addFilter('min_likes', options.minLikes);
    addFilter('max_likes', options.maxLikes);
    addFilter('likes_not_min', options.likesNotMin);
    addFilter('likes_not_max', options.likesNotMax);
    addFilter('min_comments', options.minComments);
    addFilter('max_comments', options.maxComments);
    addFilter('comments_not_min', options.commentsNotMin);
    addFilter('comments_not_max', options.commentsNotMax);
    addFilter('category_id', options.categoryId);
    addFilter('category_id_not', options.categoryIdNot);
    addFilter('license', options.license);
    addFilter('license_not', options.licenseNot);
    addFilter('definition', options.definition);
    addFilter('definition_not', options.definitionNot);
    addFilter('caption', options.caption);
    addFilter('caption_not', options.captionNot);
    addFilter('default_language', options.defaultLanguage);
    addFilter('default_language_not', options.defaultLanguageNot);
    addFilter('default_audio_language', options.defaultAudioLanguage);
    addFilter('default_audio_language_not', options.defaultAudioLanguageNot);
    addFilter('metadata_version', options.metadataVersion);
    addFilter('metadata_version_not', options.metadataVersionNot);
    addFilter('has_metadata_version', options.hasMetadataVersion);
    addFilter('has_metadata_version_not', options.hasMetadataVersionNot);
    addFilter('has_recording_date', options.hasRecordingDate);
    addFilter('has_recording_date_not', options.hasRecordingDateNot);
    addFilter('has_tags', options.hasTags);
    addFilter('has_tags_not', options.hasTagsNot);
    addFilter('needs_processing', options.needsProcessing);
    addFilter('needs_processing_not', options.needsProcessingNot);
    addFilter('already_processed', options.alreadyProcessed);
    addFilter('already_processed_not', options.alreadyProcessedNot);
    addFilter('processing_failed', options.processingFailed);
    addFilter('processing_failed_not', options.processingFailedNot);
    addFilter('has_processing_errors', options.hasProcessingErrors);
    addFilter('has_processing_errors_not', options.hasProcessingErrorsNot);

    if (filters.length === 0) {
      console.error('No filters specified. Use --help for available options.');
      process.exit(1);
    }

    // Run filtering
    const filteredVideos = filter.applyFilters(filter["videos"], filters).map(v => filter.convertToFilterResult(v, filters.map(f => f.type)));
    filter.displayResults(filters, filteredVideos, options.output, options.csv);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
} 