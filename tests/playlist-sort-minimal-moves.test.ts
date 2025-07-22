import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Helper: parse CSV to playlist items
function parseCsvPlaylistItems(csvPath: string) {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  // Normalize fields
  return records.map((row: any) => ({
    position: Number(row.position),
    videoId: row.videoId,
    title: row.title,
    privacyStatus: row.privacyStatus,
    originalFileDate: row.originalFileDate,
    recordingDate: row.recordingDate,
    publishedAt: row.publishedAt,
    lastUpdated: row.lastUpdated,
  }));
}

// Helper: get best date (copy from prod logic)
function getBestVideoDate(item: any) {
  return item.originalFileDate || item.recordingDate || item.publishedAt;
}

// Simulate minimal-move sorting algorithm
function simulateMinimalMoves(initial: any[], desired: any[]): number {
  let current = [...initial];
  let moves = 0;
  for (let i = 0; i < desired.length; i++) {
    if (current[i].videoId === desired[i].videoId) continue;
    const fromIdx = current.findIndex(x => x.videoId === desired[i].videoId);
    if (fromIdx === -1) throw new Error('Video not found in current order');
    // Move the item
    const [moved] = current.splice(fromIdx, 1);
    current.splice(i, 0, moved);
    moves++;
  }
  return moves;
}

describe('Playlist minimal-move sort simulation', () => {
  it('should simulate the number of moves needed to sort the playlist (dz23)', () => {
    const beforeCsv = path.join(__dirname, '../logs/dz23-1-before.csv');
    const afterCsv = path.join(__dirname, '../logs/dz23-2-after.csv');
    const initial = parseCsvPlaylistItems(beforeCsv);
    // Build desired order using prod logic (by best date, then by position for stability)
    const desired = [...initial].sort((a, b) => {
      const aDate = getBestVideoDate(a);
      const bDate = getBestVideoDate(b);
      const cmp = new Date(aDate).getTime() - new Date(bDate).getTime();
      if (cmp !== 0) return cmp;
      return a.position - b.position;
    });
    const moves = simulateMinimalMoves(initial, desired);
    // Output for debugging
    // eslint-disable-next-line no-console
    console.log(`Simulated moves needed to sort dz23: ${moves} (out of ${initial.length} items)`);
    // You can set an expected value if you know it, e.g. expect(moves).toBe(35);
    expect(moves).toBeLessThan(initial.length); // sanity check
  });
});
