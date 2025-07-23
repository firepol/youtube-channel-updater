import { getMinimalMoveOperations, performMoveOperations } from '../src/utils/playlist-sort-ops';
import { before, after } from './oa-before-after-data';
import { describe, it, expect } from 'vitest';

describe('OA playlist minimal-move plan', () => {

  it('should generate a move plan that sorts the playlist correctly', () => {

    // Use just the videoId arrays for the move plan
    const beforeIds = before.map(x => x.videoId);
    const afterIds = after.map(x => x.videoId);

    // Debug: print differences between before and after sets
    const beforeSet = new Set(beforeIds);
    const afterSet = new Set(afterIds);
    const onlyInBefore = beforeIds.filter(id => !afterSet.has(id));
    const onlyInAfter = afterIds.filter(id => !beforeSet.has(id));
    if (onlyInBefore.length > 0) {
      console.log('IDs in BEFORE but not in AFTER:', onlyInBefore);
    }
    if (onlyInAfter.length > 0) {
      console.log('IDs in AFTER but not in BEFORE:', onlyInAfter);
    }

    // Generate move plan (pass arrays of strings)
    const moves = getMinimalMoveOperations(beforeIds, afterIds);
    // (duplicate block removed)

    // Print moves with videoIds
    console.log(`Total moves: ${moves.length}`);
    moves.forEach((move, i) => {
      if (move.afterVideoId === null) {
        console.log(`${i + 1}. Move ${move.videoId} to the front`);
      } else {
        console.log(`${i + 1}. Move ${move.videoId} after ${move.afterVideoId}`);
      }
    });

    // Analyze initial blocks/runs that are already in correct order
    function findOrderedBlocks(beforeObjs, afterObjs) {
      const before = beforeObjs.map(x => x.videoId);
      const after = afterObjs.map(x => x.videoId);
      const blocks: Array<{ start: number, end: number, items: string[] }> = [];
      let i = 0;
      while (i < before.length) {
        const idxInAfter = after.indexOf(before[i]);
        let blockStart = i;
        let blockEnd = i;
        while (
          blockEnd + 1 < before.length &&
          after.indexOf(before[blockEnd + 1]) === idxInAfter + (blockEnd + 1 - blockStart)
        ) {
          blockEnd++;
        }
        if (blockEnd > blockStart) {
          blocks.push({ start: blockStart, end: blockEnd, items: before.slice(blockStart, blockEnd + 1) });
          i = blockEnd + 1;
        } else {
          i++;
        }
      }
      return blocks;
    }

    const blocks = findOrderedBlocks(before, after);
    console.log(`\nBlocks already in correct order:`);
    blocks.forEach((block, i) => {
      console.log(`  Block ${i + 1}: positions ${block.start}-${block.end}, items: [${block.items.join(', ')}]`);
    });
    console.log(`Total blocks: ${blocks.length}`);

    // Apply moves and check result
    const arr = [...before];
    performMoveOperations(arr, moves);
    const actual = arr.map(x => x.videoId);
    if (JSON.stringify(actual) !== JSON.stringify(afterIds)) {
      console.log('\n--- ACTUAL ORDER AFTER MOVES ---');
      console.log(actual);
      console.log('--- EXPECTED ORDER (AFTER) ---');
      console.log(afterIds);
      // Print first mismatch
      for (let i = 0; i < Math.max(actual.length, afterIds.length); i++) {
        if (actual[i] !== afterIds[i]) {
          console.log(`First mismatch at position ${i}: actual=${actual[i]}, expected=${afterIds[i]}`);
          break;
        }
      }
    }
    expect(actual).toEqual(afterIds);
  });
});
