// === Helper: Apply minimal moves in live mode ===
/**
 * Applies minimal move operations to a playlist using the YouTube API and updates the local cache.
 * @param localItems The current playlist items (array of objects)
 * @param sortedItems The desired sorted playlist items (array of objects)
 * @param playlistCache The playlist cache object (with .items)
 * @param playlistManager The playlist manager instance
 * @param youtubeClient The YouTube client instance
 * @param targetPlaylist The playlist rule (id, title)
 * @param getLogger Logger function
 */
export async function applyMinimalMovesLive({
  localItems,
  sortedItems,
  playlistCache,
  playlistManager,
  youtubeClient,
  targetPlaylist,
  getLogger
}: {
  localItems: any[];
  sortedItems: any[];
  playlistCache: any;
  playlistManager: any;
  youtubeClient: any;
  targetPlaylist: any;
  getLogger: any;
}) {
  const { getMinimalMoveOperations } = await import('../src/utils/playlist-sort-ops');
  // Map videoId to playlistItemId from cache
  const idMap: Record<string, string> = {};
  for (const item of localItems) {
    if ((item as any).playlistItemId) {
      idMap[item.videoId] = (item as any).playlistItemId;
    }
  }
  const desiredOrder = sortedItems.map(item => item.videoId);
  const currentOrder = localItems.map(item => item.videoId);
  const moves = getMinimalMoveOperations(currentOrder, desiredOrder);
  if (moves.length === 0) {
    getLogger().info(`No moves needed. Playlist '${targetPlaylist.title}' is already sorted.`);
    return;
  }
  getLogger().info(`Applying ${moves.length} minimal moves to sort playlist '${targetPlaylist.title}':`);
  let arr = [...localItems];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const playlistItemId = idMap[move.videoId];
    const afterIdx = move.afterVideoId === null ? -1 : arr.findIndex(x => x.videoId === move.afterVideoId);
    const newPosition = afterIdx + 1;
    if (!playlistItemId) {
      getLogger().error(`No playlistItemId in cache for videoId=${move.videoId}. Skipping move.`);
      continue;
    }
    try {
      await youtubeClient.updatePlaylistItemPosition(playlistItemId, newPosition);
      getLogger().info(`  ${i + 1}. Moved videoId=${move.videoId} (playlistItemId=${playlistItemId}) to position ${newPosition}`);
      // Update local cache: move the item in arr
      const curIdx = arr.findIndex(x => x.videoId === move.videoId);
      const [moved] = arr.splice(curIdx, 1);
      arr.splice(newPosition, 0, moved);
      // Update positions in local cache
      arr.forEach((item, idx) => (item.position = idx));
      playlistCache.items = [...arr];
      await playlistManager["savePlaylistCache"](targetPlaylist.id, playlistCache);
    } catch (err: any) {
      const errMsg = err && err.message ? err.message : String(err);
      if (errMsg.includes('quota') || errMsg.includes('Rate limit')) {
        getLogger().error(`Rate limit error detected, stopping further moves: ${errMsg}`);
        process.exit(1);
      } else {
        getLogger().error(`Failed to move playlistItemId=${playlistItemId} for videoId=${move.videoId}:`, err as Error);
      }
    }
  }
  getLogger().info(`Finished minimal-move sorting of playlist '${targetPlaylist.title}'. Total moves: ${moves.length}`);
}
