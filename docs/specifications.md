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

5. **Dry-Run Mode**
   - Preview all changes before applying them
   - Validate configurations and data integrity
   - Estimate API quota usage
   - Show detailed before/after comparisons
   - Generate comprehensive preview reports

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
- **Metadata Tag**: `[metadata v1.1: proc_20250627_100132]` (added to description)

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
  - API Key for read operations (public videos only)
  - OAuth 2.0 for write operations (updating videos, playlists)
  - **OAuth 2.0 required for fetching all videos** (public, unlisted, private)
- **Rate Limits**: 10,000 units per day (free tier)

### Technical Note: Fetching All Videos (Including Drafts)
- For the authenticated user's own channel, the system uses the YouTube Data API v3 `search.list` endpoint with `forMine: true` and OAuth authentication. This allows fetching all videos, including drafts (unpublished/private videos), in addition to public, unlisted, and private videos.
- For other channels, or when OAuth is not used, the system uses the uploads playlist (`playlistItems.list`), which only includes published videos (public, unlisted, private), but not drafts.
- This ensures the local video database is as complete as possible for the channel owner, while maintaining compatibility for other channels.

### Authentication Requirements for Complete Video Access

#### Video Visibility and API Access
- **Public videos**: Always retrievable via API (API Key or OAuth 2.0)
- **Unlisted videos**: Only retrievable with OAuth 2.0 authentication as channel owner
- **Private videos**: Only retrievable with OAuth 2.0 authentication as channel owner

#### Required Authentication Method
- **API Key only**: Limited to public videos
- **OAuth 2.0 + API Key**: Full access to all videos (public, unlisted, private)
- **Channel Owner Authentication**: Must authenticate as the channel owner to access unlisted/private videos

#### OAuth 2.0 Setup
- **Setup Script**: `scripts/setup-oauth.ts` provides OAuth 2.0 authentication
- **Required Scopes**: 
  - `https://www.googleapis.com/auth/youtube` (read/write access)
  - `https://www.googleapis.com/auth/youtube.force-ssl` (secure access)
- **Token Storage**: OAuth tokens stored in `token.json` (gitignored)
- **Authentication Flow**: Interactive browser-based authentication

#### Video Fetching Implementation Requirements
- **Use OAuth 2.0 for video listing**: Replace API key calls with OAuth 2.0 calls
- **Use `mine: true` parameter**: When authenticated as channel owner to get all videos
- **Fallback to API Key**: For public-only operations when OAuth not available
- **Authentication Check**: Verify OAuth authentication before attempting to fetch all videos

#### Benefits of Complete Video Access
- **Process all videos**: Including unlisted and private videos
- **Complete database**: Build comprehensive video database
- **Full automation**: Process videos regardless of privacy status
- **Better organization**: Include all videos in playlist management

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
- **Version Tag**: `[metadata v1.1: proc_20250627_100132]` in video description
- **Purpose**: Track which videos have been processed and with which rule version
- **Format**: Uses "proc_" prefix with date (YYYYMMDD) and time (HHMMSS) without separators
- **Benefits**: 
  - Completely avoids confusion when searching videos by recording date
  - Clear "proc_" prefix distinguishes processing time from content dates
  - No dashes or standard date formats that could match search queries
  - Compact format that's still human-readable
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

**Note**: The YouTube Data API v3 does not provide access to draft (unpublished) videos. Only videos that have been published (even as private or unlisted) are accessible via the API. Draft videos are only visible in YouTube Studio and cannot be fetched programmatically.

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

## Project Structure (Current)

```
youtube-channel-updater/
├── src/
│   ├── api/           # YouTube API integration
│   │   └── youtube-client.ts
│   ├── config/        # Configuration parsers
│   │   └── config-loader.ts
│   ├── types/         # TypeScript type definitions
│   │   └── api-types.ts
│   └── utils/         # Utility functions
│       └── logger.ts
├── config.example/    # Example configuration files
│   ├── playlists.example.json # Example playlist rules configuration
│   └── video-processing.example.json # Example video processing configuration
├── config/            # Personal configuration files (gitignored)
│   ├── playlists.json # Playlist rules configuration
│   └── video-processing.json # Video processing configuration
├── data/              # Local database and cache (gitignored)
│   ├── videos.json    # Complete channel video database
│   ├── history.json   # Metadata change history
│   └── playlists/     # Individual playlist files
│       ├── dark_zone.json
│       ├── tutorials.json
│       └── ...
├── logs/              # Log files (gitignored)
│   └── errors.log     # Error logs
├── docs/              # Documentation
│   ├── specifications.md
│   ├── plan.md
│   ├── development-tracking.md
│   └── prds/          # Product Requirements Documents
│       ├── 1.1-project-initialization.md
│       ├── 1.2-youtube-api-integration.md
│       ├── 1.3-configuration-system.md
│       ├── 2.1-video-database-builder.md
│       ├── 2.2-playlist-discovery.md
│       ├── 2.3-playlist-content-builder.md
│       ├── 3.1-video-filtering-system.md
│       ├── 3.2-video-processing-engine.md
│       ├── 3.3-playlist-management.md
│       ├── 4.1-main-update-script.md
│       ├── 4.2-logging-error-handling.md
│       └── 4.3-testing-validation.md
├── scripts/           # Executable scripts
│   ├── build-video-database.ts    # Build initial video database
│   ├── discover-playlists.ts      # Discover and cache playlists
│   ├── build-playlist-content.ts  # Populate playlist content
│   ├── filter-videos.ts           # Video filtering system
│   ├── process-videos.ts          # Video processing engine
│   ├── manage-playlists.ts        # Playlist management
│   └── update-channel.ts          # Main orchestration script
├── .env.example       # Environment variables example
├── .env               # Environment variables (gitignored)
├── package.json       # Project dependencies
├── tsconfig.json      # TypeScript configuration
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
        "type": "privacy_status",
        "value": "private"
      },
      {
        "type": "upload_status",
        "value": "uploaded"
      },
      {
        "type": "processing_status",
        "value": "succeeded"
      },
      {
        "type": "title_contains",
        "value": "Tom Clancy",
        "caseSensitive": false
      },
      {
        "type": "description_not_contains",
        "value": "[metadata",
        "caseSensitive": false
      },
      {
        "type": "made_for_kids",
        "value": false
      },
      {
        "type": "min_views",
        "value": 0
      },
      {
        "type": "published_after",
        "value": "2025-01-01"
      }
    ]
  },
  "draftProcessing": {
    "enabled": true,
    "filters": [
      {
        "type": "upload_status",
        "value": "uploaded"
      },
      {
        "type": "privacy_status",
        "value": "private"
      },
      {
        "type": "processing_status",
        "value": "succeeded"
      }
    ]
  },
  "notDraftVideos": {
    "enabled": true,
    "filters": [
      {
        "type": "privacy_status_not",
        "value": "private"
      }
    ]
  },
  "failedProcessing": {
    "enabled": true,
    "filters": [
      {
        "type": "processing_status",
        "value": "failed"
      }
    ]
  },
  "popularVideos": {
    "enabled": true,
    "filters": [
      {
        "type": "min_views",
        "value": 1000
      },
      {
        "type": "privacy_status",
        "value": "public"
      }
    ]
  },
  "videosWithoutMetadata": {
    "enabled": true,
    "filters": [
      {
        "type": "has_metadata_version_not",
        "value": true
      }
    ]
  }
}
```

**Available Filter Types:**
- **Status Filters**: `privacy_status`, `upload_status`, `processing_status`, `made_for_kids`, `embeddable`, `public_stats_viewable` (with `_not` variants)
- **Date Filters**: `published_after/before`, `recording_date_after/before`, `last_processed_after/before` (with `_not` variants)
- **Statistics Filters**: `min/max_views`, `min/max_likes`, `min/max_comments` (with `_not` variants)
- **Content Filters**: `category_id`, `license`, `definition`, `caption`, `default_language` (with `_not` variants)
- **Text Filters**: `title/description/tags_contains/not_contains`
- **Metadata Filters**: `
```

### Video Database Builder Script
- **Script**: `scripts/build-video-database.ts` - Enhanced video database builder
- **Default Behavior**: Uses channel ID from `.env` configuration
- **Flexible Channel Support**: Can fetch videos from any YouTube channel
- **Smart Authentication**: Automatic fallback between OAuth 2.0 and API key
- **Command-Line Interface**: Supports various options and commands

#### Command-Line Options
```bash
# Build database for your own channel (from .env)
tsx scripts/build-video-database.ts

# Build database for your own channel with OAuth (all videos)
tsx scripts/build-video-database.ts --use-oauth

# Fetch public videos from any channel
tsx scripts/build-video-database.ts --channel-id <CHANNEL_ID> --output <FILE>

# Fetch all videos from any channel (requires OAuth + channel access)
tsx scripts/build-video-database.ts --channel-id <CHANNEL_ID> --output <FILE> --use-oauth

# Resume interrupted build
tsx scripts/build-video-database.ts resume

# Clean up database files
tsx scripts/build-video-database.ts clean
```

#### Authentication Behavior
- **API Key Only**: Fetches public videos from any channel
- **OAuth 2.0**: Fetches all videos (public, unlisted, private) if you have access
- **Smart Fallback**: Automatically uses OAuth if available and requested, falls back to API key
- **Access Control**: OAuth requires channel owner authentication or manager/editor access

#### Use Cases
- **Own Channel Management**: Default behavior for managing your own channel
- **Research & Analysis**: Fetch public videos from any channel for analysis
- **Backup & Archive**: Create backups of channel video databases
- **Cross-Channel Comparison**: Compare video metadata across different channels

## Privacy and Publishing Rules (2024-06 Update)

### Privacy Rules Configuration
- Privacy for each video can be determined by:
  - Explicit config override (per video)
  - Keywords in the title (configurable)
  - Default privacy for publish/draft
- Example config:
```json
{
  "privacyRules": {
    "videoTitleKeywords": {
      "unlisted": ["unlisted", "microphone"],
      "private": ["private", "secret"]
    },
    "defaultVideoPrivacy": {
      "publish": "public",
      "draft": "unlisted"
    }
  }
}
```
- The most restrictive privacy found applies (private > unlisted > public).
- Manual per-video override always takes precedence.

### Publishing Logic
- The `--publish` option in `process-videos.ts` will:
  - Set privacy to public **only if** no privacy keyword or override applies.
  - If a video is public but matches an "unlisted" or "private" keyword, it will be changed to the more restrictive privacy.
  - If a video is unlisted/private by keyword or override, it will **not** be made public, even with `--publish`.

### Playlist Assignment Restrictions
- Unlisted/private videos **cannot** be added to public playlists.
- Unlisted videos **can** be added to unlisted playlists.
- Private videos are not added to any public or unlisted playlists.
- These rules are enforced by config and checked before playlist assignment.

### Edge Cases
- If a video matches both "unlisted" and "private" keywords, the most restrictive privacy is used.
- If a video is already public but should be unlisted/private, the script will downgrade its privacy.
- Batch operations process each video according to these rules.

## Playlist Management Enhancements (2025-07-17)

### Playlist Selection
- New option: `--list <value>`
  - Accepts either a playlist title or playlist id.
  - Smart detection: if value matches a playlist file (after sanitizing as filename), treat as title; else, check if it matches a playlist id in config; error if neither found.

### Dry-Run and Output
- `--dry-run` shows a preview, makes no changes.
- `--output <file>`:
  - For `--sort` and `--remove-duplicates`, saves before/after CSVs for comparison:
    - `<output>-1-before.csv` (original order)
    - `<output>-2-after.csv` (result)
  - CSVs include: position, videoId, title, privacyStatus, recordingDate, publishedAt, lastUpdated

### Logging
- Always print a summary at the end (e.g., number of items before/after, duplicates removed, order changes).
- For large lists, keep logs concise and focus on summary.

### Workflow
- `--fetch-items --list "..."` to fetch a specific playlist.
- `--remove-duplicates --list "..." [--dry-run --output logs/foo.json]`
- `--sort --list "..." [--dry-run --output logs/foo.json]`
- `--orphans --list "..."` to assign orphans to a specific playlist.

### No Backup Option
- User will handle backups manually as needed.