// Utility to sanitize playlist names for filenames
export function sanitizePlaylistName(name: string | undefined | null): string {
  if (!name) {
    return 'untitled_playlist';
  }
  return name
    .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .toLowerCase()
    .trim();
} 