#!/usr/bin/env tsx

import fs from 'fs-extra';
import path from 'path';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import { LocalVideo } from '../src/types/api-types';

const logger = initializeLogger({
  verbose: process.env.VERBOSE === 'true',
  logLevel: LogLevel.INFO,
  logsDir: 'logs',
});

function parseDateTime(str: string): string | undefined {
  // Good format: 2025-07-04 22:01 or 2025-07-04 22:01:15
  const good = str.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (good) {
    const date = good[1];
    const hour = good[2];
    const min = good[3];
    const sec = good[4] || '00';
    // Compose ISO string manually, always append Z
    return `${date}T${hour}:${min}:${sec}Z`;
  }
  // Bad format: 2025 07 04   22 01 15 06 (year month day hour min sec ms)
  const bad = str.match(/(\d{4})[ .-]?(\d{2})[ .-]?(\d{2})\s+(\d{2})[ .-]?(\d{2})[ .-]?(\d{2})(?:[ .-]?(\d{2,3}))?/);
  if (bad) {
    const ms = bad[7] ? bad[7].padEnd(3, '0') : undefined;
    const iso = `${bad[1]}-${bad[2]}-${bad[3]}T${bad[4]}:${bad[5]}:${bad[6]}` + (ms ? `.${ms}` : '') + 'Z';
    return iso;
  }
  return undefined;
}

function extractOriginalFileDate(description: string): string | undefined {
  const lines = description.split(/\n|\r/);
  for (const line of lines) {
    const dt = parseDateTime(line);
    if (dt) return dt;
  }
  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = path.resolve('data/videos.json');
  if (!(await fs.pathExists(file))) {
    logger.error('data/videos.json not found');
    process.exit(1);
  }
  const videos: LocalVideo[] = await fs.readJson(file);
  let updated = 0;
  const missing: { id: string; title: string }[] = [];
  for (const video of videos) {
    const orig = video.originalFileDate;
    const extracted = extractOriginalFileDate(video.description || '');
    if (extracted && orig !== extracted) {
      video.originalFileDate = extracted;
      updated++;
    }
    if (!extracted) {
      missing.push({ id: video.id, title: video.title });
    }
    if (dryRun) {
      logger.info(`ID: ${video.id}`);
      logger.info(`Title: ${video.title}`);
      logger.info(`Description: ${video.description?.split('\n')[0] || ''}`);
      logger.info(`originalFileDate: ${video.originalFileDate || 'N/A'}`);
      logger.info('---');
    }
  }
  if (!dryRun) {
    await fs.writeJson(file, videos, { spaces: 2 });
    logger.success(`Updated ${updated} videos with originalFileDate.`);
  } else {
    logger.info(`Dry run complete. ${updated} videos would be updated.`);
  }
  // Summary of missing dates
  if (missing.length > 0) {
    logger.warning(`Could not extract originalFileDate for ${missing.length} videos:`);
    for (const v of missing) {
      logger.warning(`  ID: ${v.id} | Title: ${v.title}`);
    }
  } else {
    logger.success('Successfully extracted originalFileDate for all videos.');
  }
}

main().catch(e => {
  logger.error('Script failed', e);
  process.exit(1);
}); 