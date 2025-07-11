#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, getLogger, LogLevel } from '../src/utils/logger';

async function exportDraftVideos() {
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

    // Prepare CSV output
    const outputPath = path.join('data', 'draft-videos.csv');
    await fs.ensureDir(path.dirname(outputPath));
    const csvHeader = 'videoId,title,privacyStatus,lastUpdated\n';
    await fs.writeFile(outputPath, csvHeader);

    // Paginate through search.list with mine: true
    let pageToken: string | undefined = undefined;
    let totalFetched = 0;
    let page = 1;
    const seenIds = new Set<string>();
    const allVideos: any[] = [];
    do {
      logger.info(`Fetching page ${page}...`);
      const searchResponse: any = await youtubeClient['youtube'].search.list({
        auth: youtubeClient['oauth2Client'],
        part: ['id'],
        forMine: true,
        type: ['video'],
        maxResults: 50,
        pageToken
      });
      const items = searchResponse.data.items || [];
      if (items.length === 0) break;
      // Get video IDs
      const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean);
      // Fetch video details
      const videos = await youtubeClient.getVideoDetails(videoIds);
      for (const v of videos) {
        if (!seenIds.has(v.id)) {
          seenIds.add(v.id);
          allVideos.push(v);
        }
      }
      totalFetched += videos.length;
      logger.info(`Fetched ${videos.length} videos (total: ${totalFetched})`);
      pageToken = searchResponse.data.nextPageToken;
      page++;
    } while (pageToken);

    // Write deduplicated videos to CSV
    const csvRows = allVideos.map(v => {
      const safeTitle = (v.snippet?.title || '').replace(/"/g, '""');
      const lastUpdated = v.snippet?.publishedAt || '';
      return `${v.id},"${safeTitle}",${v.status?.privacyStatus || ''},${lastUpdated}`;
    });
    await fs.writeFile(outputPath, csvHeader + csvRows.join('\n') + '\n');
    logger.success(`Exported ${allVideos.length} unique videos to ${outputPath}`);
    logger.info('Checking for likely drafts (private, no lastUpdated)...');
    // Read back and log likely drafts
    const allRows = (await fs.readFile(outputPath, 'utf-8')).split('\n').slice(1).filter(Boolean);
    const likelyDrafts = allRows.filter(row => row.match(/,private,,?$/));
    logger.info(`Likely drafts found: ${likelyDrafts.length}`);
    likelyDrafts.forEach(row => logger.info(row));
  } catch (err) {
    getLogger().error('Failed to export draft video list', err as Error);
    process.exit(1);
  }
}

exportDraftVideos(); 