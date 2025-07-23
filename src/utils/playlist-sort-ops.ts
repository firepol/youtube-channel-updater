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
 * Returns a minimal list of move operations to transform currentOrder into desiredOrder.
 * Each move is applied in memory, so subsequent moves use the updated order.
 * @param currentOrder Array of videoIds (current playlist order)
 * @param desiredOrder Array of videoIds (desired playlist order)
 */
export function getMinimalMoveOperations(currentOrder: string[], desiredOrder: string[]): MoveOperation[] {
  const moves: MoveOperation[] = [];
  let working = [...currentOrder];
  for (let targetIdx = 0; targetIdx < desiredOrder.length; targetIdx++) {
    const vid = desiredOrder[targetIdx];
    const curIdx = working.indexOf(vid);
    if (curIdx === targetIdx) continue; // already in place
    // Remove from current position
    working.splice(curIdx, 1);
    // Insert at targetIdx
    working.splice(targetIdx, 0, vid);
    // Determine afterVideoId (null if at front)
    const afterVideoId = targetIdx === 0 ? null : working[targetIdx - 1];
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
