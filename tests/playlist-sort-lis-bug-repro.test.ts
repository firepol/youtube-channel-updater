// Repro test for LIS playlist sort bug: does a second run still show videos to move?
import { describe, it, expect } from 'vitest';

// Extracted from dg-2-after.csv, positions 208–237 (inclusive)
const playlist = [
  { videoId: 's3vyv5BxAOg', date: '2025-07-01T19:19:00Z' },
  { videoId: 'RYl5lgmEa_8', date: '2025-07-01T19:23:00Z' },
  { videoId: 'Acyp9XTVTCw', date: '2025-07-02T13:27:00Z' },
  { videoId: 'TurWS9eE-F4', date: '2025-07-02T13:31:00Z' },
  { videoId: 'iB_Z9IshlvI', date: '2025-07-02T13:32:00Z' },
  { videoId: '0Xf9TbS8m6w', date: '2025-07-02T13:40:00Z' },
  { videoId: 'dhwwO0hbatE', date: '2025-07-02T14:10:00Z' },
  { videoId: 'r24gV8X8Hn0', date: '2025-07-03T10:09:00Z' },
  { videoId: 'fp9sho-sDzw', date: '2025-07-03T10:15:00Z' },
  { videoId: 'fN4f5tWVDYs', date: '2025-07-03T10:27:00Z' },
  { videoId: '6twoDojoGZA', date: '2025-07-03T10:29:00Z' },
  { videoId: 'eKOzFL7B8wQ', date: '2025-07-03T10:36:00Z' },
  { videoId: '0NMXRm1iKL4', date: '2025-07-03T13:54:00Z' },
  { videoId: 'u-2_HJVgyd0', date: '2025-07-03T14:03:00Z' },
  { videoId: 'PlLzM_NA8pY', date: '2025-07-03T14:14:13.130Z' },
  { videoId: 'M143sUUQheI', date: '2025-07-03T14:29:53.180Z' },
  { videoId: 'Ozgrfpp7Jkg', date: '2025-07-03T15:33:00Z' },
  { videoId: '0iAbC0qOx7M', date: '2025-07-03T16:06:00Z' },
  { videoId: '2-VpXD6hbWQ', date: '2025-07-04T20:24:00Z' },
  { videoId: 'qRWJkjm7jCc', date: '2025-07-04T21:00:57Z' },
  { videoId: 'Li4aUti04K4', date: '2025-07-04T21:15:00Z' },
  { videoId: '1Gzyl34TK-8', date: '2025-07-04T21:40:00Z' },
  { videoId: 'WsangLnSp_0', date: '2025-07-04T21:45:00Z' },
  { videoId: 'hixaDPClVyo', date: '2025-07-04T21:52:00Z' },
  { videoId: '9vEN4agDtFs', date: '2025-07-04T22:01:00Z' },
  { videoId: 'LzoS4XwBwoA', date: '2025-07-04T22:04:00Z' },
  { videoId: 'Smy-ShXuV08', date: '2025-07-04T22:08:00Z' },
  { videoId: 'Sa4Of4gFeoo', date: '2025-07-04T22:11:00Z' },
];

function sortByDate(a: typeof playlist[0], b: typeof playlist[0]) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

// LIS algorithm: returns indices of the LIS in the input array
function longestIncreasingSubsequence(arr: number[]): number[] {
  const n = arr.length;
  const prev = Array(n).fill(-1);
  const dp = Array(n).fill(1);
  let maxLen = 1, maxIdx = 0;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[j] <= arr[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;
        prev[i] = j;
      }
    }
    if (dp[i] > maxLen) {
      maxLen = dp[i];
      maxIdx = i;
    }
  }
  // Reconstruct LIS
  const lis: number[] = [];
  let k = maxIdx;
  while (k !== -1) {
    lis.push(k);
    k = prev[k];
  }
  return lis.reverse();
}

function getMovesToSortLIS(list: typeof playlist) {
  // Target: sorted by date ascending
  const sorted = [...list].sort(sortByDate);
  const dateToIndex = new Map(sorted.map((v, i) => [v.videoId, i]));
  const currentOrder = list.map(v => dateToIndex.get(v.videoId)!);
  const lis = longestIncreasingSubsequence(currentOrder);
  // Videos not in LIS need to be moved
  const toMove = list.filter((_, idx) => !lis.includes(idx));
  return toMove;
}

describe('LIS playlist sort bug reproduction', () => {
  it('should not require further moves after sorting once', () => {
    // 1st sort: get moves
    let moves = getMovesToSortLIS(playlist);
    // Apply moves: simulate by sorting
    let sorted = [...playlist].sort(sortByDate);
    // 2nd sort: should be no moves needed
    let moves2 = getMovesToSortLIS(sorted);
    if (moves2.length > 0) {
      console.log('Moves still needed after sorting:', moves2.map(v => v.videoId));
    }
    expect(moves2.length).toBe(0);
  });

  it('should not require further moves after step-by-step LIS moves', () => {
    // Simulate the LIS move process step by step, as in production
    let working = [...playlist];
    let totalMoves = 0;
    let pass = 0;
    while (true) {
      const moves = getMovesToSortLIS(working);
      if (moves.length === 0) break;
      // Simulate moving each video to its correct position (as prod would do)
      for (const move of moves) {
        // Find the correct position in the sorted list
        const sorted = [...working].sort(sortByDate);
        const correctIdx = sorted.findIndex(v => v.videoId === move.videoId);
        const curIdx = working.findIndex(v => v.videoId === move.videoId);
        // Remove from current position
        working.splice(curIdx, 1);
        // Insert at correct position
        working.splice(correctIdx, 0, move);
        totalMoves++;
      }
      pass++;
      if (pass > 10) throw new Error('Too many passes, possible infinite loop');
    }
    // After all moves, check if any further moves are needed
    const moves2 = getMovesToSortLIS(working);
    if (moves2.length > 0) {
      console.log('Moves still needed after step-by-step LIS moves:', moves2.map(v => v.videoId));
    }
    expect(moves2.length).toBe(0);
  });
});
