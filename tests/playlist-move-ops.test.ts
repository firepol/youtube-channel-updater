import { getMinimalMoveOperations, performMoveOperations } from '../src/utils/playlist-sort-ops';


// Dummy playlist items with videoId and originalFileDate
type PlaylistItem = { videoId: string; originalFileDate: string };
const testCurrentObjs: PlaylistItem[] = [
  { videoId: 'fCZDPWx1tjk', originalFileDate: '2025-06-30T12:59:00Z' },
  { videoId: '3UjAoqdTSg0', originalFileDate: '2025-06-30T17:17:00Z' },
  { videoId: 't9tIsbDQZcQ', originalFileDate: '2025-06-30T18:34:00Z' },
  { videoId: 'N0AQYKK7fnI', originalFileDate: '2025-07-01T08:06:00Z' },
  { videoId: '-SaBsvHvSn4', originalFileDate: '2025-07-01T09:01:00Z' },
  { videoId: 'RL5l0nL3USM', originalFileDate: '2025-07-03T08:34:00Z' },
  { videoId: '0EiSDg7tzIU', originalFileDate: '2025-07-01T08:05:00Z' },
  { videoId: 'hV5xJWG47H4', originalFileDate: '2025-07-03T08:37:00Z' },
  { videoId: 'wLhM9Q62Vi4', originalFileDate: '2025-06-30T16:09:00Z' },
  { videoId: 'Yi-h2rAO7-Y', originalFileDate: '2025-07-03T21:20:00Z' },
];
// Desired order: sort by originalFileDate ascending
const testDesiredObjs = [...testCurrentObjs].sort((a, b) => a.originalFileDate.localeCompare(b.originalFileDate));

const testCurrent = testCurrentObjs.map(x => x.videoId);
const testDesired = testDesiredObjs.map(x => x.videoId);

describe('getMinimalMoveOperations', () => {
  it('produces a minimal set of moves to reach desired order (objects)', () => {
    const moves = getMinimalMoveOperations(testCurrent, testDesired);
    // Print moves for visibility
    console.log('Moves to reach desired order:');
    moves.forEach((move, i) => {
      if (move.afterVideoId === null) {
        console.log(`${i + 1}. Move ${move.videoId} to the front`);
      } else {
        console.log(`${i + 1}. Move ${move.videoId} after ${move.afterVideoId}`);
      }
    });
    // Apply moves to array of objects
    const arr = [...testCurrentObjs];
    performMoveOperations(arr, moves);
    const result = arr.map(x => x.videoId);
    expect(result).toEqual(testDesired);
    // Should be minimal
    // (We don't assert exact moves here, just that the result is correct and moves are not excessive)
    expect(moves.length).toBeLessThanOrEqual(testCurrent.length - 1);
  });
});
