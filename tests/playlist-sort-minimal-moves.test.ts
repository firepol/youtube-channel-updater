import { describe, it, expect } from 'vitest';



// Helper: generate a test playlist of 236 items with made-up titles and real originalFileDate values
function generateTestPlaylist() {
  // These are the originalFileDate values from the real CSV, truncated for brevity in this example.
  // In a real test, paste all 236 dates here.
  const originalFileDates = [
    "2025-03-09T08:16:18.040Z", "2025-03-10T13:44:46.020Z", "2025-03-12T08:17:20.020Z", "2025-03-12T08:26:11.030Z", "2025-03-12T08:58:52.050Z",
    // ... (add all 236 originalFileDate strings from the CSV, in order)
    // For demonstration, we'll fill the rest with incrementing days
  ];
  // If not all 236 are pasted, fill up to 236
  while (originalFileDates.length < 236) {
    const base = new Date("2025-03-09T08:16:18.040Z");
    base.setDate(base.getDate() + originalFileDates.length);
    originalFileDates.push(base.toISOString());
  }
  return Array.from({ length: 236 }, (_, i) => ({
    position: i,
    videoId: `vid${i + 1}`,
    title: `Video ${i + 1}`,
    privacyStatus: 'public',
    originalFileDate: originalFileDates[i],
    // Only required fields for the test
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
  it('should simulate the number of moves needed to sort a 236-item playlist (in-memory)', () => {
    const initial = generateTestPlaylist();
    // Shuffle the initial list to simulate an unsorted playlist
    const shuffled = [...initial].sort(() => Math.random() - 0.5);
    // Build desired order using prod logic (by best date, then by position for stability)
    const desired = [...initial].sort((a, b) => {
      const aDate = getBestVideoDate(a);
      const bDate = getBestVideoDate(b);
      const cmp = new Date(aDate).getTime() - new Date(bDate).getTime();
      if (cmp !== 0) return cmp;
      return a.position - b.position;
    });
    const movesGreedy = simulateMinimalMoves(shuffled, desired);
    const movesLIS = simulateLISMinimalMoves(shuffled, desired);
    // Output for debugging
    // eslint-disable-next-line no-console
    console.log(`Simulated moves needed to sort 236 videos (greedy): ${movesGreedy} (out of ${initial.length} items)`);
    // eslint-disable-next-line no-console
    console.log(`Simulated moves needed to sort 236 videos (LIS optimal): ${movesLIS} (out of ${initial.length} items)`);
    expect(movesLIS).toBeLessThan(movesGreedy); // LIS should be optimal or equal
    expect(movesLIS).toBeLessThan(initial.length); // sanity check
  });
});
