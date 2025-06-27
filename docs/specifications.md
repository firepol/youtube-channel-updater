# YouTube Channel Updater - Project Specifications

## Project Overview

**Project Name**: youtube-channel-updater  
**Purpose**: Automate the management of YouTube video metadata and playlist organization for content creators.

## Core Functionality

### Primary Features
1. **Video Metadata Updates**
   - Update video titles (e.g., add dates automatically)
   - Modify video descriptions
   - Update recording dates
   - Change video tags and categories
   - Modify thumbnails

2. **Video Publishing**
   - Publish draft videos automatically
   - Change video privacy status (public, private, unlisted)

3. **Playlist Management**
   - Automatically add videos to playlists based on rules
   - Create new playlists as needed
   - Organize videos by content type, date, or other criteria

4. **Smart Video Detection**
   - Retrieve latest uploaded videos (including drafts)
   - Process videos based on filename or title patterns
   - Apply different rules for different video types

## User Workflow & Requirements

### Current Upload Process
- **Manual Upload**: Videos uploaded manually through YouTube Studio
- **File Naming Pattern**: `Tom Clancy's The Division 2 2025.03.29 - 10.01.17.02 going rogue gone wrong.mp4`
- **YouTube Auto-Title**: YouTube converts to `Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong`

### Desired Output Format

#### Title Transformation
- **Input**: `Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong`
- **Output**: `DZ going rogue gone wrong / The Division 2 / 2025-03-29`

#### Description Transformation
- **Input**: `Tom Clancy's The Division 2 2025 03 29   10 01 17 02`
- **Output**: `Tom Clancy's The Division 2 / 2025-03-29 10:01`
- **Metadata Tag**: `[metadata v1.1: 2025-06-27 10:01:32]` (added to description)

#### Video Settings
- **Audience**: "No, it's not made for kids" (checked)
- **Recording Date**: Match file upload date
- **License**: Creative Commons
- **Shorts Remixing**: "Allow video and audio remixing" (checked)
- **Category**: Gaming
- **Game Title**: Tom Clancy's The Division 2: Warlords of New York Edition

#### Tag Management System
- **Base Tags**: Common tags for all gaming videos (e.g., "The Division 2", "Gaming", "Gameplay")
- **Dynamic Tags**: 1-2 tags extracted from filename/title content
- **Smart Tagging**: Avoid duplicate tags that already appear in title
- **Tag Limit**: YouTube allows up to 500 characters total for all tags

### Playlist Management

#### Playlist Rules System
- **Configuration**: JSON file with playlist rules
- **Structure**: Each playlist contains ID, title, description, visibility, and rules array
- **Rule Format**: Array of keywords to match in video title (case-insensitive)
- **Keyword Matching**: Case-insensitive, respects spaces (e.g., "sp " won't match "specific" but will match "sp mission")
- **Example**: If title contains "DZ" → add to "Dark Zone" playlist
- **Multiple Playlists**: Same video can be added to multiple playlists based on different keywords

#### Playlist Sorting
- **Sorting Preference**: Manual sorting by oldest to newest
- **Implementation**: Add videos directly to correct chronological position using YouTube API position parameter
- **API Support**: `playlistItems.insert` with `position` parameter (50 units per insertion)
- **Scope**: ~10 playlists, hundreds of videos
- **Caching Strategy**: Permanent local cache of playlist contents, refreshed only on manual request

### Future Flexibility
- **Alternative File Names**: Support for files without "Tom Clancy's The Division 2" prefix
- **Example**: `2025.03.29 - 10.01.17.02 going rogue gone wrong.mp4`
- **Configurable System**: Rules-based title and description generation
- **Multi-Channel Support**: Reusable for other YouTube channels

## Technical Architecture

### Technology Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **YouTube API**: YouTube Data API v3
- **Authentication**: OAuth 2.0 + API Key
- **Testing**: TypeScript testing framework (Jest/Vitest)
- **Environment**: Linux (manual execution)
- **Execution**: TypeScript files compiled on-the-fly using `ts-node` or `tsx`

### Configuration System
- **Environment Variables**: `.env` file for API credentials and verbosity
- **Example File**: `.env.example` for setup guidance
- **Playlist Rules**: JSON configuration file
- **Title/Description Rules**: Configurable transformation patterns
- **Example Configs**: `config.example/` folder with sample configurations

### API Requirements
- **YouTube Data API v3**: Primary API for all operations
- **Authentication**: 
  - API Key for read operations
  - OAuth 2.0 for write operations (updating videos, playlists)
- **Rate Limits**: 10,000 units per day (free tier)

### YouTube API Rate Limits
- **Daily Quota**: 10,000 units (free tier)
- **API Call Costs**:
  - List videos: 1 unit per request
  - Update video: 50 units per request
  - List playlists: 1 unit per request
  - Add to playlist: 50 units per request
  - Get video details: 1 unit per request

**Rate Limit Analysis for 500 Videos**:
- Initial scan: ~500 units (list videos)
- Update all videos: ~25,000 units (500 × 50)
- **Total**: ~25,500 units (exceeds daily limit)

**Important**: Processing 500 videos costs ~25,500 API units, but the free tier only provides 10,000 units per day. See [YouTube Data API v3 Quotas](https://developers.google.com/youtube/v3/getting-started#quota) for detailed information.

**Solution**: Implement metadata versioning system to avoid reprocessing videos unnecessarily.

### Metadata Versioning System
- **Version Tag**: `[metadata v1.1: 2025-06-27 10:01:32]` in video description
- **Purpose**: Track which videos have been processed and with which rule version
- **Smart Processing**: Only process videos without metadata tag or with outdated version
- **Initial Processing Rules**: Configurable filters for identifying unprocessed videos
- **Benefits**: 
  - Avoid reprocessing already updated videos
  - Support rule version updates (v1.0 → v1.1)
  - Efficient processing of large channels
  - Track processing history

### Local Video Database System
- **Database Location**: `data/videos.json` - Complete channel video database
- **Database Structure**: All videos with title, ID, datetime (from filename/description), and current description
- **History Location**: `data/history.json` - Track of all title/description changes
- **Purpose**: Acts as both backup and local cache for video metadata
- **Benefits**:
  - Avoid repeated API calls for video details
  - Enable efficient chronological sorting
  - Track all metadata changes over time
  - Serve as source of truth for video information

### Playlist Management System
- **Playlist Files**: Individual JSON files per playlist in `data/playlists/` folder
- **File Naming**: Playlist name sanitized (spaces → underscores, special chars removed)
- **File Structure**: Each playlist contains video position, ID, and title
- **Data Source**: Video titles retrieved from local database, not API calls
- **API Optimization**: Fetch only video IDs from YouTube API (minimal cost)

### Backup System
- **Database Location**: `data/videos.json` - Complete channel video database
- **History Location**: `data/history.json` - Track of all metadata changes
- **Database Structure**: 
  - Videos with known dates: sorted chronologically (oldest first)
  - Videos with unknown dates: sorted as-is (newest added last)
- **History Structure**: Array of objects with `{ date, videoId, field, oldValue, newValue }`
- **Update Logic**: 
  - Save current state to database
  - Only add history entry if value actually changed
  - Track both title and description changes separately

### Logging System
- **Error Logs**: `logs/errors.log` file
- **Verbosity**: Configurable via `.env` file
- **Helper Function**: `logVerbose()` for debug information
- **Log Levels**: Error, Info, Verbose (debug)

### Error Handling Strategy
- **Retry Logic**: Maximum 3 attempts per video with delays between retries
- **Error Types**:
  - **Rate Limit Errors**: Stop immediately
  - **Credits Exhausted**: Stop immediately
  - **Other Errors**: Continue processing, log errors
- **Failure Threshold**: Stop if same error occurs for consecutive videos
- **Error Logging**: All errors logged to `logs/errors.log`

### Playlist Caching Strategy
- **Cache Location**: Individual JSON files in `data/playlists/` folder
- **Cache Duration**: Permanent until manually refreshed
- **Cache Content**: Video IDs and positions only (titles from local database)
- **Cache Refresh**: Manual command to regenerate cache
- **Benefits**: Minimize API calls, enable efficient position calculations

### Feasible API Operations
✅ **Supported Operations**:
- Update video titles, descriptions, tags, categories
- Modify video privacy status and publish/unpublish
- Add/remove videos from playlists
- Create and manage playlists
- Retrieve video metadata and channel information
- Access draft videos for modification
- Set video recording dates
- Configure audience settings, license, remixing permissions
- Add videos to specific positions in playlists (manual sorting)

❌ **Limitations**:
- Cannot modify actual video content
- YouTube API v2 is deprecated
- Rate limits apply to all operations

## Execution Workflow

1. **Setup Phase**
   - Configure YouTube API credentials in `.env`
   - Define playlist rules in JSON configuration
   - Set up title/description transformation patterns
   - Initialize video database (one-time fetch of all videos)
   - Initialize playlist cache (fetch video IDs only)

2. **Execution Phase**
   - Run local script manually after upload
   - Script retrieves latest videos (including drafts)
   - Parses filename/title to extract date and content info
   - Applies transformation rules to title and description
   - Sets video metadata (audience, license, category, etc.)
   - Publishes videos
   - Adds to appropriate playlists based on keyword rules
   - Sorts playlists chronologically using local database

3. **Rule-Based Processing**
   - Videos categorized by title keywords
   - Different rules for different content types
   - Automatic date insertion in titles
   - Playlist assignment based on content type

## Project Structure (Proposed)

```
youtube-channel-updater/
├── src/
│   ├── api/           # YouTube API integration
│   ├── rules/         # Video processing rules
│   ├── utils/         # Utility functions
│   ├── types/         # TypeScript type definitions
│   └── config/        # Configuration parsers
├── config.example/    # Example configuration files
│   ├── playlists.json # Example playlist rules configuration
│   └── templates.json # Example title/description templates
├── config/            # Personal configuration files (gitignored)
│   ├── playlists.json # Playlist rules configuration
│   └── templates.json # Title/description templates
├── data/              # Local database and cache (gitignored)
│   ├── videos.json    # Complete channel video database
│   ├── history.json   # Metadata change history
│   └── playlists/     # Individual playlist files
│       ├── dark_zone.json
│       ├── tutorials.json
│       └── ...
├── logs/              # Log files (gitignored)
│   └── errors.log     # Error logs
├── tests/             # Test files
├── docs/              # Documentation
├── scripts/           # Executable scripts
│   ├── populate-playlists.ts  # Script to populate playlists.json
│   ├── update-videos.ts       # Main video update script
│   ├── refresh-cache.ts       # Manual cache refresh script
│   └── fetch-playlists.ts     # Fetch playlist video IDs
├── .env.example       # Environment variables example
├── .env               # Environment variables (gitignored)
└── .gitignore         # Git ignore file
```

## Configuration Examples

### Environment Variables (.env)
```env
YOUTUBE_API_KEY=your_api_key_here
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
YOUTUBE_REFRESH_TOKEN=your_refresh_token_here
VERBOSE=true
```

### Initial Processing Rules
```json
{
  "initialProcessing": {
    "enabled": true,
    "filters": [
      {
        "type": "title_contains",
        "value": "Tom Clancy"
      },
      {
        "type": "description_not_contains",
        "value": "[metadata"
      }
    ]
  }
}
```

### Playlist Rules JSON Structure
```json
{
  "playlists": [
    {
      "id": "playlist_id_1",
      "title": "Dark Zone",
      "description": "Dark Zone gameplay videos",
      "visibility": "public",
      "rules": ["DZ", "dark zone", "rogue"]
    },
    {
      "id": "playlist_id_2", 
      "title": "Tutorials",
      "description": "Game tutorials and guides",
      "visibility": "public",
      "rules": ["tutorial", "guide", "how to"]
    }
  ]
}
```

### Title/Description Templates
```json
{
  "templates": {
    "division2": {
      "titleFormat": "{content} / The Division 2 / {date}",
      "descriptionFormat": "Tom Clancy's The Division 2 / {date} {time}",
      "dateFormat": "YYYY-MM-DD",
      "timeFormat": "HH:mm",
      "baseTags": ["The Division 2", "Gaming", "Gameplay", "Tom Clancy", "4K", "Royalty Free", "Free Reuse"],
      "metadataVersion": "v1.1"
    }
  }
}
```

### Tag Management Strategy
```json
{
  "tagRules": {
    "baseTags": ["The Division 2", "Gaming", "Gameplay", "Tom Clancy", "4K", "Royalty Free", "Free Reuse"],
    "dynamicTagCount": 2,
    "excludeFromTitle": true,
    "maxTotalTags": 15,
    "keywordMapping": {
      "DZ": "Dark Zone",
      "rogue": "Rogue Agent",
      "tutorial": "Tutorial"
    }
  }
}
```

### Video Database Structure (data/videos.json)
```json
{
  "videos": [
    {
      "id": "video_id_1",
      "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29",
      "description": "Tom Clancy's The Division 2 / 2025-03-29 10:01",
      "datetime": "2025-03-29T10:01:00Z",
      "recordingDate": "2025-03-29",
      "lastUpdated": "2025-06-27T10:01:32Z"
    }
  ]
}
```

### History Structure (data/history.json)
```json
{
  "changes": [
    {
      "date": "2025-06-27T10:01:32Z",
      "videoId": "video_id_1",
      "field": "title",
      "oldValue": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong",
      "newValue": "DZ going rogue gone wrong / The Division 2 / 2025-03-29"
    },
    {
      "date": "2025-06-27T10:01:32Z",
      "videoId": "video_id_1",
      "field": "description",
      "oldValue": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02",
      "newValue": "Tom Clancy's The Division 2 / 2025-03-29 10:01"
    }
  ]
}
```

### Playlist File Structure (data/playlists/dark_zone.json)
```json
{
  "playlistId": "playlist_id_1",
  "title": "Dark Zone",
  "videos": [
    {
      "position": 0,
      "videoId": "video_id_1",
      "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29"
    },
    {
      "position": 1,
      "videoId": "video_id_2",
      "title": "Dark Zone PvP action / The Division 2 / 2025-03-30"
    }
  ]
}
```
