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

Build a local database of all videos from your YouTube channel.

```bash
# Using npm script (recommended)
npm run build:video-db [command]

# Or using tsx directly
npx tsx scripts/build-video-database.ts [command]
```

**Commands**:
- `build` (default) - Build the video database
- `resume` - Resume interrupted build
- `clean` - Clean up database files and start fresh

**Examples**:
- `npm run build:video-db` - Build database
- `npm run build:video-db resume` - Resume interrupted build
- `npm run build:video-db clean` - Clean up files

**Features**:
- Paginated fetching with resume capability
- Duplicate prevention
- Progress tracking
- Rate limit awareness
- Extracts datetime from titles/descriptions
- Saves to `data/videos.json`

**Note**: This is the foundation for all other operations. Run this first!

### 3. Playlist Discovery

**Script**: `scripts/discover-playlists.ts`

Discover all playlists from your YouTube channel and generate configuration templates.

```bash
# Using npm script (recommended)
npm run discover-playlists [command]

# Or using tsx directly
npx tsx scripts/discover-playlists.ts [command]
```

**Commands**:
- `discover` (default) - Discover all playlists
- `clean` - Clean up playlist files

**Examples**:
- `npm run discover-playlists` - Discover playlists
- `npm run discover-playlists clean` - Clean up files

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

**Examples**:
- `npm run process-videos -- --input filtered-videos.json` - Process filtered videos
- `npm run process-videos -- --video-id VIDEO_ID --dry-run` - Preview specific video changes
- `npm run process-videos -- --input filtered-videos.json --force` - Force process all videos

**Features**:
- Title and description transformation
- Metadata versioning with processing ID
- Backup system integration
- Change history tracking
- Tag generation

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

**Examples**:
- `npm run manage-playlists -- --input processed-videos.json` - Add videos to playlists
- `npm run manage-playlists -- --video-id VIDEO_ID --dry-run` - Preview playlist assignment
- `npm run manage-playlists -- --refresh-cache` - Refresh playlist cache

**Features**:
- Keyword-based playlist matching
- Chronological position calculation
- Cache management for efficiency
- Detailed assignment reporting

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

1. **Update video database** (gets new videos)
   ```bash
   npm run build:video-db
   ```

2. **Filter videos for processing**
   ```bash
   npm run filter-videos -- --needs-processing true --preview
   npm run filter-videos -- --needs-processing true > videos-to-process.json
   ```

3. **Process videos**
   ```bash
   npm run process-videos -- --input videos-to-process.json
   ```

4. **Manage playlists**
   ```bash
   npm run manage-playlists -- --input processed-videos.json
   ```

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