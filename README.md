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

## Usage

### Initial Setup

1. **Get your channel ID** (if you don't have it)
   ```bash
   npm run get-channel-id -- --handle your_handle
   # Example: npm run get-channel-id -- --handle skypaul77
   ```

2. **Build video database**
   ```bash
   npm run build:video-db
   ```

3. **Discover playlists**
   ```bash
   npm run discover-playlists
   ```

4. **Build playlist content**
   ```bash
   npm run build-playlists
   ```

### Video Processing

1. **Filter videos** (preview mode)
   ```bash
   npm run filter-videos
   ```

2. **Process videos**
   ```bash
   npm run process-videos
   ```

3. **Manage playlists**
   ```bash
   npm run manage-playlists
   ```

4. **Full update** (all steps)
   ```bash
   npm run update-videos
   ```

## Finding Your Channel ID

If you don't know your YouTube channel ID, use the channel discovery script:

```bash
# Using npm script (recommended)
npm run get-channel-id -- --handle your_channel_handle

# Or using tsx directly
npx tsx scripts/get-channel-id.ts --handle your_channel_handle
```

**Examples:**
- `npm run get-channel-id -- --handle skypaul77`
- `npm run get-channel-id -- --handle @skypaul77`

The script will:
- Search for your channel by handle
- Display channel information (title, subscribers, videos, etc.)
- Save the channel ID to `data/channel-info.json`
- Work even if your channel doesn't have a custom URL set up

**Note**: You only need your API key for this operation - OAuth credentials are not required.

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

## License

MIT License - see LICENSE file for details.