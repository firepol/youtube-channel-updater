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


// Greedy minimal-move sorting algorithm (current implementation)
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

// LIS-based minimal-move sorting algorithm
function simulateLISMinimalMoves(initial: any[], desired: any[]): number {
  // Map videoId to desired index
  const idToDesiredIdx = new Map<string, number>();
  desired.forEach((item, idx) => idToDesiredIdx.set(item.videoId, idx));
  // Build the sequence of desired indices for the current order
  const seq = initial.map(item => idToDesiredIdx.get(item.videoId));
  // Find LIS in seq
  const lis = longestIncreasingSubsequence(seq);
  // Moves needed = total - LIS length
  return initial.length - lis.length;
}

// Standard LIS O(n log n) implementation, returns the indices of the LIS
function longestIncreasingSubsequence(arr: (number|undefined)[]): number[] {
  const n = arr.length;
  const parent = new Array(n);
  const pileTops: number[] = [];
  const pileIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = arr[i];
    if (x === undefined) continue;
    let lo = 0, hi = pileTops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((arr[pileTops[mid]] as number) < x) lo = mid + 1;
      else hi = mid;
    }
    if (lo === pileTops.length) pileTops.push(i);
    else pileTops[lo] = i;
    parent[i] = lo > 0 ? pileTops[lo - 1] : -1;
    pileIdx[i] = lo;
  }
  // Reconstruct LIS
  let lis: number[] = [];
  let k = pileTops.length > 0 ? pileTops[pileTops.length - 1] : -1;
  for (let i = pileTops.length - 1; i >= 0; i--) {
    lis[i] = k;
    k = parent[k];
  }
  return lis;
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
    const movesGreedy = simulateMinimalMoves(initial, desired);
    const movesLIS = simulateLISMinimalMoves(initial, desired);
    // Output for debugging
    // eslint-disable-next-line no-console
    console.log(`Simulated moves needed to sort dz23 (greedy): ${movesGreedy} (out of ${initial.length} items)`);
    // eslint-disable-next-line no-console
    console.log(`Simulated moves needed to sort dz23 (LIS optimal): ${movesLIS} (out of ${initial.length} items)`);
    // You can set an expected value if you know it, e.g. expect(movesLIS).toBe(60);
    expect(movesLIS).toBeLessThan(movesGreedy); // LIS should be optimal or equal
    expect(movesLIS).toBeLessThan(initial.length); // sanity check
  });
});
