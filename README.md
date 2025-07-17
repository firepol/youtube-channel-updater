# YouTube Channel Updater

Automate the management of YouTube video metadata and playlist organization for content creators.

## Features

- **Video Metadata Updates**: Update titles, descriptions, tags, and settings automatically
- **Smart Title Transformation**: Convert filenames to formatted titles with dates
- **Playlist Management**: Automatically organize videos into playlists based on keywords
- **Chronological Sorting**: Maintain proper chronological order in playlists
- **Rate Limit Management**: Efficient API usage with smart caching
- **Metadata Versioning**: Track processed videos to avoid reprocessing

## Quick Start

### Prerequisites

- Node.js 18+ 
- YouTube Data API v3 credentials
- Google Cloud Console project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd youtube-channel-updater
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your YouTube API credentials
   ```

4. **Get YouTube API credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable YouTube Data API v3
   - Create credentials (API Key + OAuth 2.0)
   - Add credentials to `.env` file

### Configuration

1. **Environment Variables** (`.env`)
   ```bash
   YOUTUBE_API_KEY=your_api_key
   YOUTUBE_CLIENT_ID=your_oauth_client_id
   YOUTUBE_CLIENT_SECRET=your_oauth_client_secret
   YOUTUBE_CHANNEL_ID=your_channel_id
   ```

2. **Playlist Rules** (`config/playlists.json`)
   ```json
   {
     "playlists": [
       {
         "id": "playlist_id",
         "title": "Dark Zone",
         "keywords": ["DZ", "dark zone", "rogue"]
       }
     ]
   }
   ```

### OAuth 2.0 Setup (Optional)

For complete access to all videos (including unlisted and private), set up OAuth 2.0 authentication:

```bash
# Set up OAuth 2.0 authentication
npx tsx scripts/setup-oauth.ts

# Test OAuth authentication
npx tsx scripts/setup-oauth.ts test
```

**What OAuth 2.0 enables**:
- Access to all videos (public, unlisted, private) from your own channels
- Access to all videos from channels where you're a manager/editor
- Write operations (updating videos, playlists)

**What API Key only enables**:
- Access to public videos from any channel
- Read operations (viewing videos, playlists)

**Setup Process**:
1. Run the setup script
2. Open the provided URL in your browser
3. Authorize the application
4. Copy the authorization code back to the terminal
5. Tokens are automatically saved to `token.json`

**Note**: OAuth setup is optional. Most operations work with API key only, but OAuth provides complete access when needed.

## Scripts Documentation

### 1. Channel ID Discovery

**Script**: `scripts/get-channel-id.ts`

Get your YouTube channel ID from your channel handle.

```bash
# Using npm script (recommended)
npm run get-channel-id -- --handle your_channel_handle

# Or using tsx directly
npx tsx scripts/get-channel-id.ts --handle your_channel_handle
```

**Options**:
- `-h, --handle <handle>` - YouTube channel handle (e.g., skypaul77)
- `-v, --verbose` - Enable verbose logging

**Examples**:
- `npm run get-channel-id -- --handle skypaul77`
- `npm run get-channel-id -- --handle @skypaul77`

**Output**: 
- Displays channel information (title, subscribers, videos, etc.)
- Saves channel ID to `data/channel-info.json`
- Works even if your channel doesn't have a custom URL set up

**Note**: You only need your API key for this operation - OAuth credentials are not required.

### 2. Video Database Builder

**Script**: `scripts/build-video-database.ts`

Build a local database of all videos from your YouTube channel or any other channel.

```bash
# Using npm script (recommended)
npm run build:video-db [options] [command]

# Or using tsx directly
npx tsx scripts/build-video-database.ts [options] [command]
```

**Commands**:
- `build` (default) - Build the video database
- `resume` - Resume interrupted build
- `clean` - Clean up database files and start fresh

**Options**:
- `--channel-id <ID>` - Channel ID to fetch videos from (default: from .env)
- `--output <FILE>` - Output file path (default: data/videos.json)
- `--use-oauth` - Use OAuth 2.0 for complete access (public, unlisted, private)
- `--help` - Show help message

**Examples**:
```bash
# Your own channel (from .env) - API key only (public videos)
npm run build:video-db

# Your own channel (from .env) - OAuth (all videos)
npm run build:video-db -- --use-oauth

# Any channel - API key only (public videos)
npm run build:video-db -- --channel-id UCN8FkVLFVQCwMsFloU-KaAA --output other-channel.json

# Any channel - OAuth (all videos if you have access)
npm run build:video-db -- --channel-id UCN8FkVLFVQCwMsFloU-KaAA --output other-channel.json --use-oauth

# Resume interrupted build
npm run build:video-db resume

# Clean up database files
npm run build:video-db clean
```

**Features**:
- **Flexible Channel Support**: Fetch videos from your own channel or any other channel
- **Smart Authentication**: Automatic fallback between OAuth 2.0 and API key
- **Paginated fetching** with resume capability
- **Duplicate prevention**
- **Progress tracking**
- **Rate limit awareness**
- **Extracts datetime** from titles/descriptions
- **Custom output files** to avoid conflicts
- **Comprehensive help system**

**Authentication Behavior**:
- **API Key Only**: Fetches public videos from any channel (no OAuth required)
- **OAuth 2.0**: Fetches all videos (public, unlisted, private) if you have channel access
- **Smart Fallback**: Automatically uses OAuth if available and requested, falls back to API key
- **Access Control**: OAuth requires channel owner authentication or manager/editor access

**Use Cases**:
- **Own Channel Management**: Default behavior for managing your own channel
- **Research & Analysis**: Fetch public videos from any channel for analysis
- **Backup & Archive**: Create backups of channel video databases
- **Cross-Channel Comparison**: Compare video metadata across different channels

**Note**: This is the foundation for all other operations. Run this first! For complete access to unlisted/private videos, use OAuth authentication.

> **Note:** When using `--use-oauth` for your own channel, the script now fetches all videos (including drafts) using `search.list` with `forMine: true`. For other channels or without OAuth, it uses the uploads playlist (published videos only).

### 2a. Export Draft/Private Videos

**Script**: `scripts/export-draft-videos.ts`

Export a CSV of all videos from your channel—including private and draft videos—using the YouTube Data API v3 `search.list` endpoint with OAuth authentication.

```bash
# Run the script directly
npx tsx scripts/export-draft-videos.ts
```

**What it does:**
- Authenticates as the channel owner using OAuth
- Uses the `search.list` endpoint with `forMine: true` to fetch all videos (public, unlisted, private, and drafts if available)
- Fetches full details for each video
- Deduplicates by video ID
- Outputs a CSV: `data/draft-videos.csv` with columns:
  - `videoId`, `title`, `privacyStatus`, `lastUpdated`
- Logs the number of likely drafts (private videos with no lastUpdated)

**Caveats:**
- The YouTube API may not always return true "draft" (unpublished) videos, but this script maximizes the chance by using the most permissive endpoint and OAuth.
- Useful for auditing which private/draft videos are present in your channel and not included in the main video database.

### 3. Playlist Discovery

**Script**: `scripts/discover-playlists.ts`

Discover all playlists from your YouTube channel and generate configuration templates.

```bash
# Using npm script (recommended)
npm run discover-playlists [command] [options]

# Or using tsx directly
npx tsx scripts/discover-playlists.ts [command] [options]
```

**Commands**:
- `discover` (default) - Discover all playlists
- `clean` - Clean up playlist files

**Options**:
- `--fetch-items` - Fetch all items (videos) for each playlist and populate playlist JSON files

**Examples**:
- `npm run discover-playlists` - Discover playlists (metadata only)
- `npm run discover-playlists -- --fetch-items` - Discover playlists and fetch all video items for each playlist
- `npm run discover-playlists clean` - Clean up files

**What does `--fetch-items` do?**
- When you use `--fetch-items`, the script will fetch all videos (items) for each playlist from YouTube and populate the `items` array in each playlist JSON file under `data/playlists/`.
- This is useful for keeping your local playlist files in sync with the actual contents of your YouTube playlists.
- If you do not use this option, only playlist metadata (id, title, description, etc.) will be saved, and the `items` array will be empty.

**Output**:
- Creates `config/playlists.json` template
- Creates individual playlist files in `data/playlists/`
- Displays statistics (public/private/unlisted counts)

### 4. Playlist Content Builder

**Script**: `scripts/build-playlist-content.ts`

Build content for playlists by fetching video details from YouTube API.

```bash
# Using npm script (recommended)
npm run build-playlists [command] [playlist_name]

# Or using tsx directly
npx tsx scripts/build-playlist-content.ts [command] [playlist_name]
```

**Commands**:
- `build` (default) - Build content for all playlists
- `playlist <name>` - Build content for specific playlist
- `clean` - Clean up playlist content

**Examples**:
- `npm run build-playlists` - Build all playlists
- `npm run build-playlists playlist "Dark Zone"` - Build specific playlist
- `npm run build-playlists clean` - Clean up content

**Output**:
- Updates playlist files with video details
- Maintains chronological order
- Handles rate limits efficiently

### 5. Video Filtering System

**Script**: `scripts/filter-videos.ts`

Filter videos based on various criteria for processing.

```bash
# Using npm script (recommended)
npm run filter-videos [options]

# Or using tsx directly
npx tsx scripts/filter-videos.ts [options]
```

**Main Options**:
- `--preview` - Preview mode (show count without processing)
- `--config <path>` - Use configuration file
- `--verbose` - Verbose output

**Text Filters**:
- `--title-contains <text>` - Title contains text
- `--title-not-contains <text>` - Title does not contain text
- `--description-contains <text>` - Description contains text
- `--description-not-contains <text>` - Description does not contain text
- `--tags-contains <text>` - Tags contain text
- `--tags-not-contains <text>` - Tags do not contain text

**Status Filters**:
- `--privacy-status <status>` - Privacy status (private, public, unlisted)
- `--upload-status <status>` - Upload status (uploaded, processing, failed, rejected)
- `--processing-status <status>` - Processing status (succeeded, processing, failed)
- `--made-for-kids <boolean>` - Made for kids setting
- `--embeddable <boolean>` - Embeddable setting
- `--public-stats-viewable <boolean>` - Public stats viewable setting

**Date Filters**:
- `--published-after <date>` - Published after date (YYYY-MM-DD)
- `--published-before <date>` - Published before date (YYYY-MM-DD)
- `--recording-date-after <date>` - Recording date after (YYYY-MM-DD)
- `--recording-date-before <date>` - Recording date before (YYYY-MM-DD)
- `--last-processed-after <date>` - Last processed after (YYYY-MM-DD)
- `--last-processed-before <date>` - Last processed before (YYYY-MM-DD)

**Statistics Filters**:
- `--min-views <number>` - Minimum view count
- `--max-views <number>` - Maximum view count
- `--min-likes <number>` - Minimum like count
- `--max-likes <number>` - Maximum like count
- `--min-comments <number>` - Minimum comment count
- `--max-comments <number>` - Maximum comment count

**Content Filters**:
- `--category-id <id>` - Category ID
- `--license <license>` - License (youtube, creativeCommon)
- `--definition <definition>` - Definition (hd, sd)
- `--caption <caption>` - Caption availability (true, false)
- `--default-language <lang>` - Default language code
- `--default-audio-language <lang>` - Default audio language code

**Metadata Filters**:
- `--metadata-version <version>` - Metadata version
- `--has-metadata-version <boolean>` - Has metadata version
- `--has-recording-date <boolean>` - Has recording date
- `--has-tags <boolean>` - Has tags

**Processing Filters**:
- `--needs-processing <boolean>` - Needs processing
- `--already-processed <boolean>` - Already processed
- `--processing-failed <boolean>` - Processing failed
- `--has-processing-errors <boolean>` - Has processing errors

**Examples**:
- `npm run filter-videos -- --preview` - Preview all videos
- `npm run filter-videos -- --needs-processing true --preview` - Preview videos needing processing
- `npm run filter-videos -- --published-after 2024-01-01 --min-views 1000` - Filter by date and views

### 6. Video Processing Engine

**Script**: `scripts/process-videos.ts`

Process and update video metadata (titles, descriptions, tags).

```bash
# Using npm script (recommended)
npm run process-videos [options]

# Or using tsx directly
npx tsx scripts/process-videos.ts [options]
```

**Options**:
- `-i, --input <file>` - Input file with filtered videos (JSON)
- `-v, --video-id <id>` - Process specific video by ID
- `--dry-run` - Show what would be changed without making API calls
- `--force` - Force processing even if metadata version matches
- `--verbose` - Enable verbose logging
- `-o, --output <file>` - Output file for dry-run reports

**Direct Filtering Options** (no input file needed):
- `--filter-config <file>` - Filter configuration file
- `--privacy-status <status>` - Direct privacy status filter
- `--published-after <date>` - Direct date filter (YYYY-MM-DD)
- `--published-before <date>` - Direct date filter (YYYY-MM-DD)
- `--title-contains <text>` - Direct title filter
- `--description-contains <text>` - Direct description filter
- `--min-views <number>` - Direct views filter
- `--max-views <number>` - Direct views filter

**Examples**:
- `npm run process-videos -- --input filtered-videos.json` - Process filtered videos
- `npm run process-videos -- --video-id VIDEO_ID --dry-run` - Preview specific video changes
- `npm run process-videos -- --input filtered-videos.json --force` - Force process all videos
- `npm run process-videos -- --privacy-status unlisted --dry-run` - Preview unlisted video changes
- `npm run process-videos -- --title-contains "tutorial" --min-views 100 --dry-run` - Preview tutorial videos with 100+ views
- `npm run process-videos -- --privacy-status private --description-not-contains "metadata" --dry-run`
- `npm run process-videos -- --dry-run --filter-config config/filter-missing-recording-date.json --output logs/noRecordingDate.json` - Process videos without a recordingDate set

**Features**:
- Title and description transformation
- Metadata versioning with processing ID
- Backup system integration
- Change history tracking
- Tag generation
- Direct filtering from channel database

### 7. Playlist Management

**Script**: `scripts/manage-playlists.ts`

Add videos to playlists with proper chronological sorting.

```bash
# Using npm script (recommended)
npm run manage-playlists [options]

# Or using tsx directly
npx tsx scripts/manage-playlists.ts [options]
```

**Options**:
- `-i, --input <file>` - Input file with processed videos (JSON)
- `--video-id <id>` - Process specific video by ID
- `--dry-run` - Show what would be done without making changes
- `--refresh-cache` - Force refresh playlist cache from YouTube API
- `-v, --verbose` - Enable verbose logging
- `-o, --output <file>` - Output file for dry-run reports

**Direct Filtering Options** (no input file needed):
- `--filter-config <file>` - Filter configuration file
- `--privacy-status <status>` - Direct privacy status filter
- `--published-after <date>` - Direct date filter (YYYY-MM-DD)
- `--published-before <date>` - Direct date filter (YYYY-MM-DD)
- `--title-contains <text>` - Direct title filter
- `--description-contains <text>` - Direct description filter
- `--min-views <number>` - Direct views filter
- `--max-views <number>` - Direct views filter

**Examples**:
- `npm run manage-playlists -- --input processed-videos.json` - Add videos to playlists
- `npm run manage-playlists -- --video-id VIDEO_ID --dry-run` - Preview playlist assignment
- `npm run manage-playlists -- --refresh-cache` - Refresh playlist cache
- `npm run manage-playlists -- --privacy-status unlisted --dry-run` - Preview unlisted video playlist assignments
- `npm run manage-playlists -- --title-contains "DZ" --min-views 1000 --dry-run` - Preview high-view DZ video assignments

**Features**:
- Keyword-based playlist matching
- Chronological position calculation
- Cache management for efficiency
- Detailed assignment reporting
- Direct filtering from channel database

## Complete Workflow

### Initial Setup (One-time)

1. **Get your channel ID**
   ```bash
   npm run get-channel-id -- --handle your_handle
   ```

2. **Build video database**
   ```bash
   npm run build:video-db
   ```

3. **Discover playlists**
   ```bash
   npm run discover-playlists
   ```

4. **Configure playlists** (edit `config/playlists.json`)

5. **Build playlist content**
   ```bash
   npm run build-playlists
   ```

### Regular Updates

#### Option 1: Traditional Workflow (with input files)

1. **Update video database** (gets new videos)
   ```bash
   npm run build:video-db
   ```

2. **Filter videos for processing**
   ```bash
   npm run filter-videos -- --needs-processing true --preview
   npm run filter-videos -- --needs-processing true > videos-to-process.json
   ```

Here are some personal examples of video title and description transformations:

- **Original Title:** `Tom Clancy's The Division 2 2025 03 09   07 33 12 03 Various activities with random group`
- **Transformed Title:** `Tom Clancy's The Division 2 / 2025-03-09 07:33 Various activities with random group`

- **Original Description:** *(empty)*
- **Transformed Description:** `Tom Clancy's The Division 2 / 2025-03-09 07:33 Various activities with random group\n\n[metadata v1.1: proc_20250704_173137]`

- **Original Title:** `Just a regular gaming video`
- **Transformed Title:** *(unchanged)*

- **Original Description:** `Just a regular description`
- **Transformed Description:** `Just a regular description\n\n[metadata v1.1: proc_20250704_173137]`

3. **Process videos**
   ```bash
   npm run process-videos -- --input videos-to-process.json
   ```

Personal examples:

```
npm run filter-videos -- --preview --privacy-status public --title-contains "Tom Clancy"
npm run filter-videos -- --preview --privacy-status public --title-contains "Tom Clancy" --title-contains "   "
```


4. **Manage playlists**
   ```bash
   npm run manage-playlists -- --input processed-videos.json
   ```

#### Option 2: Enhanced Workflow (direct filtering)

**Direct filtering allows you to process videos without creating intermediate files:**

1. **Update video database** (gets new videos)
   ```bash
   npm run build:video-db
   ```

2. **Process videos with direct filtering**
   ```bash
   # Process all unlisted videos
   npm run process-videos -- --privacy-status unlisted --dry-run
   
   # Process videos with specific criteria
   npm run process-videos -- --privacy-status unlisted --title-contains "tutorial" --dry-run
   
   # Process videos from a date range
   npm run process-videos -- --published-after 2024-01-01 --published-before 2024-12-31 --dry-run
   ```

3. **Manage playlists with direct filtering**
   ```bash
   # Add unlisted videos to playlists
   npm run manage-playlists -- --privacy-status unlisted --dry-run
   
   # Add videos matching specific criteria to playlists
   npm run manage-playlists -- --title-contains "DZ" --min-views 1000 --dry-run
   ```

#### Option 3: Mixed Workflow (best of both worlds)

1. **Update video database**
   ```bash
   npm run build:video-db
   ```

2. **Preview with direct filtering**
   ```bash
   # Preview what would be processed
   npm run process-videos -- --privacy-status unlisted --dry-run --output preview.json
   
   # Review the preview report
   cat preview.json
   ```

3. **Process with confidence**
   ```bash
   # Run actual processing
   npm run process-videos -- --privacy-status unlisted
   
   # Manage playlists
   npm run manage-playlists -- --privacy-status unlisted
   ```

### Available Direct Filter Options

Both `process-videos.ts` and `manage-playlists.ts` support these direct filter options:

**Privacy & Status Filters:**
- `--privacy-status <status>` - Filter by privacy (public, private, unlisted)
- `--upload-status <status>` - Filter by upload status
- `--processing-status <status>` - Filter by processing status

**Date Filters:**
- `--published-after <YYYY-MM-DD>` - Videos published after date
- `--published-before <YYYY-MM-DD>` - Videos published before date

**Content Filters:**
- `--title-contains <text>` - Title contains specific text
- `--description-contains <text>` - Description contains specific text

**Statistics Filters:**
- `--min-views <number>` - Minimum view count
- `--max-views <number>` - Maximum view count

**Configuration Files:**
- `--filter-config <file>` - Use complex filter configuration file

### Workflow Examples

**Example 1: Process all unlisted videos**
```bash
# Preview what would be changed
npm run process-videos -- --privacy-status unlisted --dry-run --output unlisted-preview.json

# Review the preview
cat unlisted-preview.json

# Apply the changes
npm run process-videos -- --privacy-status unlisted

# Add to playlists
npm run manage-playlists -- --privacy-status unlisted
```

**Example 2: Process recent videos with low views**
```bash
# Process videos from last month with less than 1000 views
npm run process-videos -- --published-after 2024-11-01 --max-views 1000 --dry-run

# Apply changes
npm run process-videos -- --published-after 2024-11-01 --max-views 1000
```

**Example 3: Process specific content types**
```bash
# Process all tutorial videos
npm run process-videos -- --title-contains "tutorial" --dry-run

# Process gaming content with high engagement
npm run process-videos -- --title-contains "gaming" --min-views 500 --dry-run
```

**Example 4: Use filter configuration file**
```bash
# Create a filter config file for complex criteria
echo '{
  "unlisted_tutorials": {
    "enabled": true,
    "filters": [
      {"type": "privacy_status", "value": "unlisted"},
      {"type": "title_contains", "value": "tutorial"},
      {"type": "min_views", "value": 100}
    ]
  }
}' > my-filters.json

# Use the configuration
npm run process-videos -- --filter-config my-filters.json --dry-run
```

## File Structures

### Input Files

#### Video Database (`data/videos.json`)
The main video database containing all videos from your channel:

```json
[
  {
    "id": "video_id_1",
    "title": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong",
    "description": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02",
    "publishedAt": "2025-03-29T10:01:17Z",
    "datetime": "2025.03.29 - 10.01.17.02",
    "tags": ["gaming", "gameplay"],
    "categoryId": "20",
    "privacyStatus": "public",
    "madeForKids": false,
    "license": "youtube",
    "recordingDate": "2025-03-29T10:01:17Z",
    "lastProcessed": "2025-06-27T10:01:32Z",
    "metadataVersion": "v1.1",
    "uploadStatus": "processed",
    "processingStatus": "succeeded",
    "embeddable": true,
    "publicStatsViewable": true,
    "definition": "hd",
    "caption": "false",
    "defaultLanguage": "en",
    "defaultAudioLanguage": "en",
    "statistics": {
      "viewCount": "1234",
      "likeCount": "56",
      "dislikeCount": "0",
      "favoriteCount": "12",
      "commentCount": "8"
    },
    "processingErrors": [],
    "lastFetched": "2025-06-29T16:52:45Z",
    "lastUpdated": "2025-06-29T16:52:45Z"
  }
]
```

#### Filtered Videos Input (for `process-videos.ts`)
A subset of videos from the database, typically created by `filter-videos.ts`:

```json
[
  {
    "id": "video_id_1",
    "title": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong",
    "description": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02",
    "publishedAt": "2025-03-29T10:01:17Z",
    "recordingDate": "2025-03-29T10:01:17Z",
    "tags": ["gaming", "gameplay"],
    "categoryId": "20",
    "privacyStatus": "public",
    "madeForKids": false,
    "license": "youtube"
  }
]
```

#### Processed Videos Input (for `manage-playlists.ts`)
Videos that have been processed and need playlist assignment:

```json
[
  {
    "id": "video_id_1",
    "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29",
    "description": "Tom Clancy's The Division 2 / 2025-03-29 10:01 [metadata v1.1: proc_20250627_100132]",
    "publishedAt": "2025-03-29T10:01:17Z",
    "recordingDate": "2025-03-29T10:01:17Z",
    "tags": ["The Division 2", "Gaming", "Gameplay", "Dark Zone"],
    "categoryId": "20",
    "privacyStatus": "public",
    "madeForKids": false,
    "license": "creativeCommon"
  }
]
```

### Output Files

#### Processing Results (`processing-results-YYYY-MM-DD.json`)
Results from video processing operations:

```json
{
  "processedVideos": 45,
  "successfulUpdates": 43,
  "failedUpdates": 2,
  "errors": [
    {
      "videoId": "video_id_1",
      "error": "Rate limit exceeded",
      "attempts": 3
    }
  ],
  "processingTime": "00:05:30",
  "dryRunMode": false,
  "previewReport": null
}
```

#### Playlist Results (`playlist-results-YYYY-MM-DD.json`)
Results from playlist management operations:

```json
{
  "processedVideos": 45,
  "playlistAssignments": [
    {
      "videoId": "video_id_1",
      "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29",
      "assignedPlaylists": [
        {
          "playlistId": "playlist_id_1",
          "playlistTitle": "Dark Zone",
          "position": 15,
          "status": "success"
        }
      ]
    }
  ],
  "totalAssignments": 67,
  "successfulAssignments": 65,
  "failedAssignments": 2,
  "processingTime": "00:03:45",
  "dryRunMode": false,
  "previewReport": null
}
```

#### Dry-Run Preview Reports
Comprehensive preview reports when using `--dry-run --output`:

**Video Processing Preview** (`process-videos.ts`):
```json
{
  "mode": "dry-run",
  "timestamp": "2025-06-29T17:15:30.123Z",
  "summary": {
    "videosToProcess": 45,
    "estimatedApiQuota": 2250,
    "processingTime": "00:02:30",
    "validationStatus": "valid"
  },
  "steps": {
    "validation": {
      "status": "completed",
      "configValid": true,
      "dataIntegrity": true,
      "apiQuotaAvailable": true,
      "authenticationValid": true
    },
    "processing": {
      "status": "completed",
      "videosToUpdate": 45,
      "estimatedQuota": 2250
    }
  },
  "preview": [
    {
      "videoId": "video_id_1",
      "currentState": {
        "title": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02 going rogue gone wrong",
        "description": "Tom Clancy's The Division 2 2025 03 29   10 01 17 02",
        "tags": ["gaming", "gameplay"],
        "recordingDate": "2025-03-29T10:01:17Z",
        "metadataVersion": null
      },
      "proposedState": {
        "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29",
        "description": "Tom Clancy's The Division 2 / 2025-03-29 10:01 [metadata v1.1: proc_20250627_100132]",
        "tags": ["The Division 2", "Gaming", "Gameplay", "Dark Zone"],
        "recordingDate": "2025-03-29T10:01:17Z",
        "metadataVersion": "[metadata v1.1: proc_20250627_100132]"
      },
      "changes": {
        "titleChanged": true,
        "descriptionChanged": true,
        "tagsChanged": true,
        "recordingDateChanged": false,
        "metadataVersionAdded": true
      },
      "validation": {
        "titleValid": true,
        "descriptionValid": true,
        "tagsValid": true,
        "warnings": [],
        "errors": []
      }
    }
  ],
  "validation": {
    "configValid": true,
    "dataIntegrity": true,
    "apiQuotaAvailable": true,
    "authenticationValid": true,
    "warnings": [],
    "errors": []
  },
  "costEstimate": {
    "totalApiCalls": 45,
    "quotaUnitsRequired": 2250,
    "dailyQuotaImpact": 22.5,
    "processingTimeEstimate": "00:05:30",
    "resourceRequirements": {
      "memory": "~50MB",
      "storage": "~2MB"
    }
  }
}
```

**Playlist Management Preview** (`manage-playlists.ts`):
```json
{
  "mode": "dry-run",
  "timestamp": "2025-06-29T17:15:30.123Z",
  "summary": {
    "videosToProcess": 45,
    "estimatedApiQuota": 1350,
    "playlistAssignments": 27,
    "processingTime": "00:01:30",
    "validationStatus": "valid"
  },
  "steps": {
    "validation": {
      "status": "completed",
      "configValid": true,
      "dataIntegrity": true,
      "apiQuotaAvailable": true,
      "authenticationValid": true
    },
    "playlistMatching": {
      "status": "completed",
      "playlistsToUpdate": 10,
      "assignmentsToMake": 27
    }
  },
  "preview": [
    {
      "videoId": "video_id_1",
      "title": "DZ going rogue gone wrong / The Division 2 / 2025-03-29",
      "currentState": {
        "playlists": []
      },
      "proposedState": {
        "playlists": [
          {
            "playlistId": "playlist_id_1",
            "playlistTitle": "Dark Zone",
            "position": 15
          },
          {
            "playlistId": "playlist_id_2",
            "playlistTitle": "The Division 2",
            "position": 23
          }
        ]
      },
      "changes": {
        "playlistsChanged": true,
        "newPlaylists": ["Dark Zone", "The Division 2"],
        "removedPlaylists": []
      },
      "validation": {
        "positionValid": true,
        "playlistValid": true,
        "warnings": [],
        "errors": []
      }
    }
  ],
  "validation": {
    "configValid": true,
    "dataIntegrity": true,
    "apiQuotaAvailable": true,
    "authenticationValid": true,
    "warnings": [],
    "errors": []
  },
  "costEstimate": {
    "totalApiCalls": 27,
    "quotaUnitsRequired": 1350,
    "dailyQuotaImpact": 13.5,
    "processingTimeEstimate": "00:03:30",
    "resourceRequirements": {
      "memory": "~30MB",
      "storage": "~1MB"
    }
  }
}
```

### Testing Workflow with Dry-Run

1. **Preview video processing**:
   ```bash
   # Filter videos that need processing
   npm run filter-videos -- --needs-processing true > videos-to-process.json
   
   # Preview what would be changed
   npm run process-videos -- --input videos-to-process.json --dry-run --output preview-videos.json
   
   # Review the preview report
   cat preview-videos.json
   ```

2. **Preview playlist assignments**:
   ```bash
   # Use processed videos for playlist assignment
   npm run manage-playlists -- --input videos-to-process.json --dry-run --output preview-playlists.json
   
   # Review the preview report
   cat preview-playlists.json
   ```

3. **Run actual processing** (after reviewing previews):
   ```bash
   # Process videos for real
   npm run process-videos -- --input videos-to-process.json
   
   # Assign to playlists for real
   npm run manage-playlists -- --input videos-to-process.json
   ```

### Validation in Dry-Run Reports

The dry-run reports include comprehensive validation:

- **Configuration Validation**: Checks all config files and settings
- **Data Integrity**: Validates video database and required fields
- **API Quota**: Estimates usage and checks daily limits
- **Authentication**: Confirms OAuth tokens are valid
- **Individual Video Validation**: Checks title/description length, tag limits, etc.

### Cost Estimation

Dry-run reports provide detailed cost estimates:

- **API Calls**: Number of API calls required
- **Quota Units**: Total quota units needed
- **Daily Impact**: Percentage of daily quota limit
- **Processing Time**: Estimated duration
- **Resource Requirements**: Memory and storage needs

This allows you to plan your operations and avoid exceeding API limits.

## Project Structure

```
youtube-channel-updater/
├── src/
│   ├── api/           # YouTube API integration
│   ├── config/        # Configuration management
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── scripts/           # Main execution scripts
├── data/              # Local data storage
│   ├── videos.json    # Video database
│   ├── history.json   # Change history
│   └── playlists/     # Playlist cache files
├── config/            # Configuration files
├── logs/              # Application logs
└── docs/              # Documentation
```

## API Rate Limits

The YouTube Data API v3 has daily quotas:
- **Free tier**: 10,000 units per day
- **Video updates**: 50 units per video
- **Playlist operations**: 50 units per operation
- **Search operations**: 1 unit per page
- **Video details**: ~1 unit per 50 videos

**Important**: Processing 500 videos costs ~25,500 API units, exceeding the daily limit. The system implements metadata versioning to avoid reprocessing videos unnecessarily.

## Development

### Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Run with tsx (development)
- `npm run test` - Run tests
- `npm run lint` - Lint code

### Adding New Features

1. Follow the TypeScript strict mode guidelines
2. Implement proper error handling with retry logic
3. Add comprehensive logging
4. Update documentation
5. Test with small datasets first

## Error Handling

The system implements robust error handling:
- **Retry Logic**: 3 attempts with delays for non-rate-limit errors
- **Rate Limit Protection**: Immediate stop on quota exhaustion
- **Error Logging**: All errors logged to `logs/errors.log`
- **Progress Tracking**: Resume capability for interrupted operations

## Contributing

1. Follow the coding standards in `docs/specifications.md`
2. Update `docs/development-tracking.md` with progress
3. Test thoroughly before submitting changes
4. Respect API rate limits during development