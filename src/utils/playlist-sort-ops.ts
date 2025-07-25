// Move an item in an array of objects by videoId, after another videoId (or to front)
export function performMoveOperation<T extends { videoId: string }>(arr: T[], move: MoveOperation): void {
  const idx = arr.findIndex(x => x.videoId === move.videoId);
  if (idx === -1) return;
  const [item] = arr.splice(idx, 1);
  if (move.afterVideoId === null) {
    arr.unshift(item);
  } else {
    const afterIdx = arr.findIndex(x => x.videoId === move.afterVideoId);
    arr.splice(afterIdx + 1, 0, item);
  }
}

// Perform a sequence of moves on an array of objects (in-place)
export function performMoveOperations<T extends { videoId: string }>(arr: T[], moves: MoveOperation[]): void {
  for (const move of moves) {
    performMoveOperation(arr, move);
  }
}
// Helper to compute minimal move operations to transform currentOrder into desiredOrder
// Each move: { videoId, afterVideoId } (null = move to front)
export interface MoveOperation {
  videoId: string;
  afterVideoId: string | null;
}

/**
 * Returns a block-aware minimal list of move operations to transform currentOrder into desiredOrder.
 * Preserves maximal runs (blocks) already in correct order, reducing unnecessary moves.
 * @param currentOrder Array of videoIds (current playlist order)
 * @param desiredOrder Array of videoIds (desired playlist order)
 */
export function getMinimalMoveOperations(currentOrder: string[], desiredOrder: string[]): MoveOperation[] {
  // Map currentOrder to indices in desiredOrder
  const posInDesired: number[] = currentOrder.map(id => desiredOrder.indexOf(id));

  // Find LIS in posInDesired
  // Patience sorting O(n log n) LIS implementation
  const n = posInDesired.length;
  const piles: number[] = [];
  const predecessors: number[] = Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const x = posInDesired[i];
    if (x === -1) continue; // skip items not in desiredOrder
    let left = 0, right = piles.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (posInDesired[piles[mid]] < x) left = mid + 1;
      else right = mid;
    }
    if (left > 0) predecessors[i] = piles[left - 1];
    if (left === piles.length) {
      piles.push(i);
    } else {
      piles[left] = i;
    }
  }
  // Reconstruct LIS
  let lis: number[] = [];
  if (piles.length > 0) {
    let k = piles[piles.length - 1];
    while (k >= 0) {
      lis.push(k);
      k = predecessors[k];
    }
    lis.reverse();
  }

  // Plan moves for items not in LIS
  let working = [...currentOrder];
  const moves: MoveOperation[] = [];
  // Build a set of videoIds in LIS for quick lookup
  const lisIds = new Set(lis.map(idx => currentOrder[idx]));
  // For each item in desiredOrder, if not in LIS, move it to the correct position
  for (let targetIdx = 0; targetIdx < desiredOrder.length; targetIdx++) {
    const vid = desiredOrder[targetIdx];
    if (lisIds.has(vid)) continue; // already in correct place
    const curIdx = working.indexOf(vid);
    // Move it after the previous item in desiredOrder (or to front)
    const afterVideoId = targetIdx === 0 ? null : working[working.indexOf(desiredOrder[targetIdx - 1])];
    // Remove from current position
    working.splice(curIdx, 1);
    // Insert at targetIdx
    const insertIdx = afterVideoId === null ? 0 : working.indexOf(afterVideoId) + 1;
    working.splice(insertIdx, 0, vid);
    moves.push({ videoId: vid, afterVideoId });
  }
  return moves;
}

// Helper to apply move operations in memory
export function applyMoveOperations(order: string[], moves: MoveOperation[]): string[] {
  let working = [...order];
  for (const move of moves) {
    const idx = working.indexOf(move.videoId);
    if (idx !== -1) working.splice(idx, 1);
    if (move.afterVideoId === null) {
      working.unshift(move.videoId);
    } else {
      const afterIdx = working.indexOf(move.afterVideoId);
      working.splice(afterIdx + 1, 0, move.videoId);
    }
  }
  return working;
}
