#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import { YouTubeClient } from '../src/api/youtube-client';
import { loadConfig } from '../src/config/config-loader';
import { getLogger, initializeLogger, LogLevel } from '../src/utils/logger';

interface ChannelInfo {
  channelId: string;
  channelTitle: string;
  handle: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  customUrl?: string;
  publishedAt: string;
  thumbnails: {
    default: string;
    medium: string;
    high: string;
  };
}

interface GetChannelIdOptions {
  handle: string;
  verbose: boolean;
}

class ChannelIdFetcher {
  private youtubeClient: YouTubeClient;
  private logger: any;

  constructor(youtubeClient: YouTubeClient) {
    this.youtubeClient = youtubeClient;
    this.logger = getLogger();
  }

  /**
   * Get channel ID from handle using search
   */
  async getChannelIdFromHandle(handle: string): Promise<ChannelInfo | null> {
    try {
      this.logger.info(`Fetching channel info for handle: ${handle}`);
      
      // Remove @ if present
      const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle;
      
      // Search for channels with this handle using the search API
      const searchResponse = await this.searchChannels(cleanHandle);
      
      if (!searchResponse.items || searchResponse.items.length === 0) {
        this.logger.error(`No channels found for handle: ${handle}`);
        return null;
      }

      // Find the channel that matches the handle exactly
      const matchingChannel = searchResponse.items.find((item: any) => {
        const channelHandle = item.snippet?.customUrl;
        return channelHandle === cleanHandle || channelHandle === `@${cleanHandle}`;
      });

      if (!matchingChannel || !matchingChannel.id?.channelId) {
        this.logger.warning(`No exact handle match found for: ${handle}`);
        this.logger.info('Available channels:');
        searchResponse.items.forEach((item: any, index: number) => {
          this.logger.info(`  ${index + 1}. ${item.snippet?.title} (${item.snippet?.customUrl || 'No handle'})`);
        });
        
        // If no exact match but we have search results, use the first one
        if (searchResponse.items.length > 0) {
          const firstChannel = searchResponse.items[0];
          if (firstChannel.id?.channelId) {
            this.logger.info(`Using first search result: ${firstChannel.snippet?.title}`);
            const channelId = firstChannel.id.channelId;
            this.logger.info(`Found channel ID: ${channelId}`);
            
            // Get detailed channel information
            const channelResponse = await this.getChannelDetails(channelId);
            
            if (!channelResponse) {
              this.logger.error(`Failed to get channel details for ID: ${channelId}`);
              return null;
            }

            const channelInfo: ChannelInfo = {
              channelId: channelId,
              channelTitle: channelResponse.title || 'Unknown',
              handle: cleanHandle,
              description: channelResponse.description || '',
              subscriberCount: parseInt(channelResponse.statistics?.subscriberCount || '0'),
              videoCount: parseInt(channelResponse.statistics?.videoCount || '0'),
              viewCount: parseInt(channelResponse.statistics?.viewCount || '0'),
              customUrl: channelResponse.customUrl,
              publishedAt: channelResponse.publishedAt || '',
              thumbnails: {
                default: channelResponse.thumbnails?.default?.url || '',
                medium: channelResponse.thumbnails?.medium?.url || '',
                high: channelResponse.thumbnails?.high?.url || ''
              }
            };

            return channelInfo;
          }
        }
        
        this.logger.error(`No channels found for handle: ${handle}`);
        return null;
      }

      const channelId = matchingChannel.id.channelId;
      this.logger.info(`Found channel ID: ${channelId}`);

      // Get detailed channel information
      const channelResponse = await this.getChannelDetails(channelId);
      
      if (!channelResponse) {
        this.logger.error(`Failed to get channel details for ID: ${channelId}`);
        return null;
      }

      const channelInfo: ChannelInfo = {
        channelId: channelId,
        channelTitle: channelResponse.title || 'Unknown',
        handle: cleanHandle,
        description: channelResponse.description || '',
        subscriberCount: parseInt(channelResponse.statistics?.subscriberCount || '0'),
        videoCount: parseInt(channelResponse.statistics?.videoCount || '0'),
        viewCount: parseInt(channelResponse.statistics?.viewCount || '0'),
        customUrl: channelResponse.customUrl,
        publishedAt: channelResponse.publishedAt || '',
        thumbnails: {
          default: channelResponse.thumbnails?.default?.url || '',
          medium: channelResponse.thumbnails?.medium?.url || '',
          high: channelResponse.thumbnails?.high?.url || ''
        }
      };

      return channelInfo;
    } catch (error) {
      this.logger.error('Error fetching channel ID:', error as Error);
      return null;
    }
  }

  /**
   * Search for channels using YouTube search API
   */
  private async searchChannels(query: string): Promise<any> {
    // We need to use the search API directly since YouTubeClient doesn't have searchChannels
    const youtube = this.youtubeClient['youtube']; // Access the private youtube property
    const apiKey = this.youtubeClient['apiKey'];

    const response = await youtube.search.list({
      key: apiKey,
      part: ['snippet'],
      q: query,
      type: ['channel'],
      maxResults: 10
    });

    return response.data;
  }

  /**
   * Get channel details using YouTube channels API
   */
  private async getChannelDetails(channelId: string): Promise<any> {
    const youtube = this.youtubeClient['youtube'];
    const apiKey = this.youtubeClient['apiKey'];

    const response = await youtube.channels.list({
      key: apiKey,
      part: ['snippet', 'statistics'],
      id: [channelId]
    });

    return response.data.items?.[0] || null;
  }

  /**
   * Save channel info to file
   */
  async saveChannelInfo(channelInfo: ChannelInfo): Promise<void> {
    const dataDir = path.join('data');
    const channelInfoFile = path.join(dataDir, 'channel-info.json');

    try {
      await fs.ensureDir(dataDir);
      await fs.writeJson(channelInfoFile, channelInfo, { spaces: 2 });
      this.logger.info(`Channel info saved to: ${channelInfoFile}`);
    } catch (error) {
      this.logger.error('Error saving channel info:', error as Error);
      throw error;
    }
  }

  /**
   * Display channel info
   */
  displayChannelInfo(channelInfo: ChannelInfo): void {
    console.log('\n📺 Channel Information:');
    console.log('=' .repeat(50));
    console.log(`Channel ID: ${channelInfo.channelId}`);
    console.log(`Title: ${channelInfo.channelTitle}`);
    console.log(`Handle: @${channelInfo.handle}`);
    console.log(`Custom URL: ${channelInfo.customUrl || 'None'}`);
    console.log(`Subscribers: ${channelInfo.subscriberCount.toLocaleString()}`);
    console.log(`Videos: ${channelInfo.videoCount.toLocaleString()}`);
    console.log(`Total Views: ${channelInfo.viewCount.toLocaleString()}`);
    console.log(`Created: ${new Date(channelInfo.publishedAt).toLocaleDateString()}`);
    console.log('=' .repeat(50));
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('get-channel-id')
    .description('Get YouTube channel ID from handle')
    .version('1.0.0')
    .option('-h, --handle <handle>', 'YouTube channel handle (e.g., skypaul77)')
    .option('-v, --verbose', 'Enable verbose logging')
    .parse();

  const options = program.opts() as GetChannelIdOptions;

  if (!options.handle) {
    console.error('❌ Error: Handle is required');
    console.log('Usage: npm run get-channel-id -- --handle skypaul77');
    process.exit(1);
  }

  try {
    // Initialize logger with default config first
    initializeLogger({
      verbose: !!options.verbose,
      logLevel: LogLevel.INFO,
      logsDir: 'logs'
    });
    const logger = getLogger();
    logger.info('Starting channel ID fetcher...');

    // Now load configuration
    const config = await loadConfig();

    // Optionally re-initialize logger with config values if present
    if (config.app && config.paths) {
      initializeLogger({
        verbose: !!options.verbose || !!config.app.verbose,
        logLevel: config.app.logLevel as LogLevel || LogLevel.INFO,
        logsDir: config.paths.logsDir || 'logs'
      });
    }

    // Initialize YouTube client
    const youtubeClient = new YouTubeClient(
      config.youtube.apiKey,
      config.youtube.clientId,
      config.youtube.clientSecret,
      config.youtube.channelId,
      config.rateLimiting.maxRetries,
      config.rateLimiting.retryDelayMs,
      config.rateLimiting.apiCallDelayMs
    );

    // Create fetcher
    const fetcher = new ChannelIdFetcher(youtubeClient);

    // Get channel info
    const channelInfo = await fetcher.getChannelIdFromHandle(options.handle);

    if (!channelInfo) {
      getLogger().error('Failed to get channel information');
      process.exit(1);
    }

    // Display channel info
    fetcher.displayChannelInfo(channelInfo);

    // Save to file
    await fetcher.saveChannelInfo(channelInfo);

    getLogger().info('✅ Channel ID fetched successfully!');
    getLogger().info(`📝 Use this channel ID in your configuration: ${channelInfo.channelId}`);

  } catch (error) {
    console.error('❌ Error:', error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
} 