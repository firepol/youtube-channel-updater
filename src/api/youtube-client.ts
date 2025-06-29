import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  YouTubeVideo, 
  YouTubePlaylist, 
  YouTubePlaylistItem, 
  YouTubeChannel,
  YouTubeApiResponse,
  YouTubeApiError,
  RateLimitInfo
} from '../types/api-types';
import { getLogger, logVerbose } from '../utils/logger';

export class YouTubeClient {
  private youtube: any;
  private oauth2Client: OAuth2Client;
  private apiKey: string;
  private channelId: string;
  private rateLimitInfo: RateLimitInfo;
  private maxRetries: number;
  private retryDelayMs: number;
  private apiCallDelayMs: number;

  constructor(
    apiKey: string,
    clientId: string,
    clientSecret: string,
    channelId: string,
    maxRetries: number = 3,
    retryDelayMs: number = 1000,
    apiCallDelayMs: number = 100
  ) {
    this.apiKey = apiKey;
    this.channelId = channelId;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.apiCallDelayMs = apiCallDelayMs;
    
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      'http://localhost:3000/auth/callback'
    );

    // Initialize YouTube API client
    this.youtube = google.youtube('v3');

    // Initialize rate limit tracking
    this.rateLimitInfo = {
      quotaUsed: 0,
      quotaLimit: 10000, // Free tier limit
      resetTime: undefined
    };
  }

  /**
   * Load OAuth tokens from file
   */
  async loadTokens(tokenPath: string = 'token.json'): Promise<boolean> {
    try {
      if (await fs.pathExists(tokenPath)) {
        const tokens = await fs.readJson(tokenPath);
        this.oauth2Client.setCredentials(tokens);
        logVerbose('OAuth tokens loaded successfully');
        return true;
      }
      return false;
    } catch (error) {
      getLogger().error('Failed to load OAuth tokens', error as Error);
      return false;
    }
  }

  /**
   * Save OAuth tokens to file
   */
  async saveTokens(tokens: any, tokenPath: string = 'token.json'): Promise<void> {
    try {
      await fs.writeJson(tokenPath, tokens, { spaces: 2 });
      logVerbose('OAuth tokens saved successfully');
    } catch (error) {
      getLogger().error('Failed to save OAuth tokens', error as Error);
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string): Promise<any> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      getLogger().error('Failed to exchange code for tokens', error as Error);
      throw error;
    }
  }

  /**
   * Check if OAuth client is authenticated
   */
  isAuthenticated(): boolean {
    const credentials = this.oauth2Client.credentials;
    return !!(credentials && credentials.access_token);
  }

  /**
   * Update rate limit tracking
   */
  private updateRateLimit(cost: number): void {
    this.rateLimitInfo.quotaUsed += cost;
    logVerbose(`API quota used: ${this.rateLimitInfo.quotaUsed}/${this.rateLimitInfo.quotaLimit}`);
  }

  /**
   * Check if we're approaching rate limits
   */
  private checkRateLimit(cost: number): boolean {
    const remaining = this.rateLimitInfo.quotaLimit - this.rateLimitInfo.quotaUsed;
    if (remaining < cost) {
      getLogger().warning(`Rate limit approaching: ${remaining} units remaining, need ${cost}`);
      return false;
    }
    return true;
  }

  /**
   * Wait between API calls to respect rate limits
   */
  private async delay(): Promise<void> {
    if (this.apiCallDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.apiCallDelayMs));
    }
  }

  /**
   * Execute API call with retry logic and error handling
   */
  private async executeApiCall<T>(
    apiCall: () => Promise<T>,
    cost: number,
    operation: string
  ): Promise<T> {
    if (!this.checkRateLimit(cost)) {
      throw new Error(`Rate limit exceeded. Need ${cost} units, have ${this.rateLimitInfo.quotaLimit - this.rateLimitInfo.quotaUsed} remaining`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.delay();
        logVerbose(`Executing ${operation} (attempt ${attempt}/${this.maxRetries})`);
        
        const result = await apiCall();
        this.updateRateLimit(cost);
        
        logVerbose(`${operation} completed successfully`);
        return result;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check for rate limit errors
        if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          getLogger().error(`Rate limit error in ${operation}: ${errorMessage}`, error as Error);
          throw error; // Don't retry rate limit errors
        }

        // Check for authentication errors
        if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid credentials')) {
          getLogger().error(`Authentication error in ${operation}: ${errorMessage}`, error as Error);
          throw error; // Don't retry auth errors
        }

        getLogger().warning(`${operation} failed (attempt ${attempt}/${this.maxRetries}): ${errorMessage}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * attempt; // Exponential backoff
          logVerbose(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    getLogger().error(`${operation} failed after ${this.maxRetries} attempts`, lastError!);
    throw lastError;
  }

  /**
   * Get channel information
   */
  async getChannel(): Promise<YouTubeChannel> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.channels.list({
          auth: this.oauth2Client,
          key: this.apiKey,
          part: ['snippet', 'statistics', 'status', 'brandingSettings'],
          id: [this.channelId]
        });

        if (!response.data.items || response.data.items.length === 0) {
          throw new Error(`Channel not found: ${this.channelId}`);
        }

        return response.data.items[0] as YouTubeChannel;
      },
      1, // API cost
      'getChannel'
    );
  }

  /**
   * Get videos from channel with pagination
   */
  async getVideos(pageToken?: string, maxResults: number = 50): Promise<YouTubeApiResponse<YouTubeVideo>> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.search.list({
          auth: this.oauth2Client,
          key: this.apiKey,
          part: ['snippet'],
          channelId: this.channelId,
          order: 'date',
          type: ['video'],
          maxResults,
          pageToken
        });

        // Get detailed video information for each video
        const videoIds = response.data.items?.map((item: any) => item.id?.videoId).filter(Boolean) || [];
        const detailedVideos = await this.getVideoDetails(videoIds);

        return {
          kind: response.data.kind || '',
          etag: response.data.etag || '',
          nextPageToken: response.data.nextPageToken,
          prevPageToken: response.data.prevPageToken,
          pageInfo: response.data.pageInfo || { totalResults: 0, resultsPerPage: 0 },
          items: detailedVideos
        };
      },
      1 + Math.ceil(maxResults / 50), // Search + estimated video details cost
      'getVideos'
    );
  }

  /**
   * Get detailed video information
   */
  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideo[]> {
    if (videoIds.length === 0) return [];

    return this.executeApiCall(
      async () => {
        const response = await this.youtube.videos.list({
          auth: this.oauth2Client,
          key: this.apiKey,
          part: ['snippet', 'status', 'statistics', 'contentDetails'],
          id: videoIds
        });

        return (response.data.items || []) as YouTubeVideo[];
      },
      Math.ceil(videoIds.length / 50), // API cost
      'getVideoDetails'
    );
  }

  /**
   * Update video metadata
   */
  async updateVideo(
    videoId: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
      categoryId?: string;
      madeForKids?: boolean;
      license?: string;
      recordingDate?: string;
    }
  ): Promise<YouTubeVideo> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.videos.update({
          auth: this.oauth2Client,
          part: ['snippet', 'status'],
          requestBody: {
            id: videoId,
            snippet: {
              title: updates.title,
              description: updates.description,
              tags: updates.tags,
              categoryId: updates.categoryId,
              recordingDate: updates.recordingDate
            },
            status: {
              madeForKids: updates.madeForKids,
              license: updates.license
            }
          }
        });

        return response.data as YouTubeVideo;
      },
      50, // High cost for video updates
      'updateVideo'
    );
  }

  /**
   * Get playlists from channel
   */
  async getPlaylists(pageToken?: string, maxResults: number = 50): Promise<YouTubeApiResponse<YouTubePlaylist>> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.playlists.list({
          auth: this.oauth2Client,
          key: this.apiKey,
          part: ['snippet', 'contentDetails'],
          channelId: this.channelId,
          maxResults,
          pageToken
        });

        return response.data as YouTubeApiResponse<YouTubePlaylist>;
      },
      1, // API cost
      'getPlaylists'
    );
  }

  /**
   * Get playlist items
   */
  async getPlaylistItems(
    playlistId: string,
    pageToken?: string,
    maxResults: number = 50
  ): Promise<YouTubeApiResponse<YouTubePlaylistItem>> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.playlistItems.list({
          auth: this.oauth2Client,
          key: this.apiKey,
          part: ['snippet'],
          playlistId,
          maxResults,
          pageToken
        });

        return response.data as YouTubeApiResponse<YouTubePlaylistItem>;
      },
      1, // API cost
      'getPlaylistItems'
    );
  }

  /**
   * Add video to playlist at specific position
   */
  async addToPlaylist(
    playlistId: string,
    videoId: string,
    position?: number
  ): Promise<YouTubePlaylistItem> {
    return this.executeApiCall(
      async () => {
        const response = await this.youtube.playlistItems.insert({
          auth: this.oauth2Client,
          part: ['snippet'],
          requestBody: {
            snippet: {
              playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId
              },
              position
            }
          }
        });

        return response.data as YouTubePlaylistItem;
      },
      50, // High cost for playlist operations
      'addToPlaylist'
    );
  }

  /**
   * Remove video from playlist
   */
  async removeFromPlaylist(playlistItemId: string): Promise<void> {
    return this.executeApiCall(
      async () => {
        await this.youtube.playlistItems.delete({
          auth: this.oauth2Client,
          id: playlistItemId
        });
      },
      50, // High cost for playlist operations
      'removeFromPlaylist'
    );
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  /**
   * Reset rate limit tracking (useful for testing)
   */
  resetRateLimit(): void {
    this.rateLimitInfo.quotaUsed = 0;
    this.rateLimitInfo.resetTime = undefined;
  }
} 