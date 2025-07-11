#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, getLogger, LogLevel } from '../src/utils/logger';

async function exportVideoList() {
  try {
    // Load config
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadBasicConfig();

    // Initialize logger
    initializeLogger({
      verbose: true,
      logLevel: LogLevel.INFO,
      logsDir: config.paths.logsDir
    });
    const logger = getLogger();

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

    // Load OAuth tokens
    const tokensLoaded = await youtubeClient.loadTokens();
    if (!tokensLoaded) {
      logger.error('OAuth tokens not found. Please run setup-oauth.ts first.');
      process.exit(1);
    }
    if (!youtubeClient.isAuthenticated()) {
      logger.error('YouTube client not authenticated.');
      process.exit(1);
    }

    // Get uploads playlist ID
    logger.info('Fetching uploads playlist ID...');
    const channelResponse = await youtubeClient['youtube'].channels.list({
      auth: youtubeClient['oauth2Client'],
      part: ['contentDetails'],
      mine: true
    });
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      logger.error('No channel found for authenticated user.');
      process.exit(1);
    }
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      logger.error('Uploads playlist not found for channel.');
      process.exit(1);
    }
    logger.info(`Uploads playlist ID: ${uploadsPlaylistId}`);

    // Prepare CSV output
    const outputPath = path.join('data', 'video-list.csv');
    await fs.ensureDir(path.dirname(outputPath));
    const csvHeader = 'videoId,title,privacyStatus,recordingDate,lastUpdated\n';

    // Paginate through uploads playlist and collect unique videos
    let pageToken: string | undefined = undefined;
    let totalFetched = 0;
    let page = 1;
    const seenIds = new Set<string>();
    const allVideos: any[] = [];
    do {
      logger.info(`Fetching page ${page}...`);
      const playlistResponse: any = await youtubeClient['youtube'].playlistItems.list({
        auth: youtubeClient['oauth2Client'],
        part: ['snippet'],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken
      });
      const items = playlistResponse.data.items || [];
      if (items.length === 0) break;
      // Get video IDs
      const videoIds = items.map((item: any) => item.snippet?.resourceId?.videoId).filter(Boolean);
      // Fetch video details
      const videos = await youtubeClient.getVideoDetails(videoIds);
      for (const v of videos) {
        if (!seenIds.has(v.id)) {
          seenIds.add(v.id);
          // Compute recordingDate and lastUpdated like in videos.json
          const recordingDate = v.recordingDate || (v as any).recordingDetails?.recordingDate || '';
          const lastUpdated = v.snippet?.publishedAt || '';
          allVideos.push({
            id: v.id,
            title: v.snippet?.title || '',
            privacyStatus: v.status?.privacyStatus || '',
            recordingDate,
            lastUpdated
          });
        }
      }
      totalFetched += videos.length;
      logger.info(`Fetched ${videos.length} videos (total: ${totalFetched})`);
      pageToken = playlistResponse.data.nextPageToken;
      page++;
    } while (pageToken);

    // Sort by lastUpdated descending (oldest to newest)
    allVideos.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());

    // Write to CSV
    const csvRows = allVideos.map(v => {
      const safeTitle = v.title.replace(/"/g, '""');
      return `${v.id},"${safeTitle}",${v.privacyStatus},${v.recordingDate || ''},${v.lastUpdated}`;
    });
    await fs.writeFile(outputPath, csvHeader + csvRows.join('\n') + '\n');
    logger.success(`Exported ${allVideos.length} unique videos to ${outputPath}`);
  } catch (err) {
    getLogger().error('Failed to export video list', err as Error);
    process.exit(1);
  }
}

exportVideoList(); 