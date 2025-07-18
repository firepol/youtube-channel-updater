#!/usr/bin/env tsx

/**
 * Debug YouTube Video Info Script
 * --------------------------------
 * Fetches all available information for a given YouTube video ID directly from the YouTube Data API v3.
 *
 * - Prints a summary and the full JSON to the console by default.
 * - Optionally saves the full JSON to a file if you use the --output <file> option.
 * - Uses your project config and authentication logic, so it works with both public and private videos (if authenticated).
 *
 * Usage:
 *   npx tsx scripts/debug-video-info.ts --video-id <VIDEO_ID>
 *   npx tsx scripts/debug-video-info.ts --video-id <VIDEO_ID> --output <output.json>
 *   npx tsx scripts/debug-video-info.ts --video-id <VIDEO_ID> --verbose
 *
 * Options:
 *   --video-id <id>   (required) The YouTube video ID to fetch
 *   --output <file>   (optional) Output file to save the video info as JSON
 *   --verbose         (optional) Enable verbose logging
 *
 * Example:
 *   npx tsx scripts/debug-video-info.ts --video-id Pn-Rc2iRBDg
 *   npx tsx scripts/debug-video-info.ts --video-id Pn-Rc2iRBDg --output output.json
 */

import fs from 'fs-extra';
import { Command } from 'commander';
import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, getLogger, LogLevel } from '../src/utils/logger';

const program = new Command();

program
  .requiredOption('--video-id <id>', 'YouTube video ID to fetch')
  .option('--output <file>', 'Output file to save the video info as JSON')
  .option('--verbose', 'Enable verbose logging');

program.parse(process.argv);
const options = program.opts();

(async () => {
  try {
    // Load config
    const configLoader = new ConfigLoader();
    const config = await configLoader.loadBasicConfig();

    // Initialize logger
    initializeLogger({
      verbose: !!options.verbose || config.app.verbose,
      logLevel: (options.verbose ? 'verbose' : config.app.logLevel) as LogLevel,
      logsDir: config.paths.logsDir
    });

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

    // Load OAuth tokens if available
    const tokensLoaded = await youtubeClient.loadTokens();
    if (!tokensLoaded) {
      getLogger().warning('OAuth tokens not found. Some info may be unavailable.');
    }

    if (!youtubeClient.isAuthenticated()) {
      getLogger().warning('YouTube client not authenticated. Only public info will be available.');
    }

    // Fetch video info from YouTube API
    const videoId = options.videoId;
    getLogger().info(`Fetching info for video ID: ${videoId}`);
    const videos = await youtubeClient.getVideoDetails([videoId]);
    if (!videos || videos.length === 0) {
      getLogger().error(`No video found for ID: ${videoId}`);
      process.exit(1);
    }
    const video = videos[0];

    // Print or save
    if (options.output) {
      await fs.writeJson(options.output, video, { spaces: 2 });
      getLogger().success(`Video info saved to ${options.output}`);
    } else {
      // Print to console
      // Print a summary first, then full JSON
      console.log('--- Video Info Summary ---');
      console.log(`ID: ${video.id}`);
      console.log(`Title: ${video.snippet?.title}`);
      console.log(`Description: ${video.snippet?.description}`);
      console.log(`Published At: ${video.snippet?.publishedAt}`);
      console.log(`Category ID: ${video.snippet?.categoryId}`);
      console.log(`Privacy Status: ${video.status?.privacyStatus}`);
      console.log(`Made For Kids: ${video.status?.madeForKids}`);
      console.log(`License: ${video.status?.license}`);
      console.log(`Tags: ${video.snippet?.tags?.join(', ')}`);
      console.log(`Recording Date: ${video.recordingDate}`);
      console.log('--- Full Video JSON ---');
      console.dir(video, { depth: null, colors: true });
    }
  } catch (err) {
    getLogger().error('Failed to fetch video info', err as Error);
    process.exit(1);
  }
})(); 