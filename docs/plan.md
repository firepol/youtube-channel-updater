# YouTube Channel Updater - Implementation Plan

## Overview
This plan outlines the step-by-step implementation of the YouTube Channel Updater project, focusing on building the foundation first, then adding processing logic.

## Phase 1: Foundation Setup

### 1.1 Project Initialization
- **Task**: Set up TypeScript project structure
- **Deliverables**: 
  - `package.json` with dependencies
  - `tsconfig.json` with strict mode
  - Basic folder structure
  - `.env.example` file
- **Dependencies**: None
- **Estimated Time**: 30 minutes

### 1.2 YouTube API Integration
- **Task**: Create YouTube API client with authentication
- **Deliverables**:
  - `src/api/youtube-client.ts` - API wrapper
  - `src/types/api-types.ts` - TypeScript interfaces
  - Authentication handling (OAuth 2.0 + API Key)
  - Rate limit tracking
- **Dependencies**: 1.1
- **Estimated Time**: 2 hours

### 1.3 Configuration System
- **Task**: Implement configuration loading and validation
- **Deliverables**:
  - `src/config/config-loader.ts`
  - `config.example/` folder with sample files
  - Environment variable validation
  - JSON schema validation
- **Dependencies**: 1.1
- **Estimated Time**: 1 hour

### 1.4 OAuth 2.0 Authentication Setup
- **Task**: Implement OAuth 2.0 authentication for complete video access
- **Deliverables**:
  - `scripts/setup-oauth.ts` - Interactive OAuth setup script
  - OAuth token management (load/save tokens)
  - Authentication verification
  - Required scopes configuration
- **Features**:
  - Interactive browser-based authentication
  - Token storage in `token.json` (gitignored)
  - Authentication testing and validation
  - Support for required scopes (`youtube`, `youtube.force-ssl`)
- **Dependencies**: 1.2, 1.3
- **Estimated Time**: 1 hour

## Phase 2: Data Foundation

### 2.1 Video Database Builder
- **Task**: Create script to build initial `videos.json` database with complete video access
- **Script**: `scripts/build-video-database.ts`
- **Features**:
  - **OAuth 2.0 Authentication**: Use OAuth 2.0 to fetch all videos (public, unlisted, private)
  - **Fallback to API Key**: Use API key for public-only access when OAuth not available
  - **Authentication Check**: Verify OAuth authentication before attempting to fetch all videos
  - **Use `mine: true` parameter**: When authenticated as channel owner to get all videos
  - Paginated fetching of all channel videos
  - Console logging of current page (for crash recovery)
  - Duplicate prevention (check by video ID)
  - Progress tracking and resume capability
  - Extract datetime from title/description
  - Handle rate limits gracefully
- **Output**: `data/videos.json` with all videos (including unlisted and private)
- **Dependencies**: 1.2, 1.3, 1.4
- **Estimated Time**: 3 hours

### 2.2 Playlist Discovery
- **Task**: Create script to discover all playlists
- **Script**: `scripts/discover-playlists.ts`
- **Features**:
  - Fetch all playlists (names, IDs, descriptions)
  - Create empty JSON files for each playlist
  - Sanitize playlist names for file naming
  - Generate `config/playlists.json` template
- **Output**: 
  - `data/playlists/` folder with empty files
  - `config/playlists.json` template
- **Dependencies**: 1.2, 1.3
- **Estimated Time**: 1 hour

### 2.3 Playlist Content Builder
- **Task**: Populate playlist files with video data
- **Script**: `scripts/build-playlist-content.ts`
- **Features**:
  - Fetch video IDs from each playlist (minimal API cost)
  - Cross-reference with `videos.json` for titles
  - Create playlist files with position, videoId, title
  - Handle pagination for large playlists
- **Output**: `data/playlists/*.json` files populated
- **Dependencies**: 2.1, 2.2
- **Estimated Time**: 2 hours

## Phase 3: Processing Logic

### 3.1 Video Filtering System
- **Task**: Implement comprehensive video filtering based on all YouTube API fields
- **Script**: `scripts/filter-videos.ts`
- **Features**:
  - **Status Filters**: Filter by privacy status, upload status, processing status, made for kids, embeddable, public stats viewable (with `_not` variants)
  - **Date Filters**: Filter by published date, recording date, last processed date ranges (with `_not` variants)
  - **Statistics Filters**: Filter by view count, like count, comment count ranges (with `_not` variants)
  - **Content Filters**: Filter by category ID, license, definition, caption, language settings (with `_not` variants)
  - **Text Filters**: Filter by title/description/tags contains/not_contains
  - **Metadata Filters**: Filter by metadata version, has metadata version, has recording date, has tags (with `_not` variants)
  - **Processing Filters**: Filter by needs processing, already processed, processing failed, has processing errors (with `_not` variants)
  - Support for metadata version checking
  - Configurable filter rules with multiple processing scenarios
  - Preview mode (show count without processing)
  - Command-line interface with all filter types
  - Configuration file support for complex filter combinations
- **Dependencies**: 2.1, 1.3
- **Estimated Time**: 3 hours (increased due to comprehensive filter types)

### 3.2 Video Processing Engine
- **Task**: Core video processing logic
- **Script**: `scripts/process-videos.ts`
- **Features**:
  - Title/description transformation
  - Tag management (base + dynamic)
  - Metadata versioning
  - Video settings updates
  - Backup system integration
  - Error handling and retry logic
- **Dependencies**: 3.1, 2.1
- **Estimated Time**: 4 hours

### 3.3 Playlist Management
- **Task**: Add videos to playlists with sorting
- **Script**: `scripts/manage-playlists.ts`
- **Features**:
  - Keyword-based playlist assignment
  - Chronological position calculation
  - Direct insertion at correct position
  - Update local playlist cache
  - Handle multiple playlist assignments
- **Dependencies**: 3.2, 2.3
- **Estimated Time**: 3 hours

## Phase 4: Integration & Testing

### 4.1 Main Update Script
- **Task**: Create unified video update script
- **Script**: `scripts/update-videos.ts`
- **Features**:
  - Orchestrate all processing steps
  - Command-line arguments for different modes
  - Progress reporting
  - Error recovery
  - Dry-run mode
- **Dependencies**: 3.2, 3.3
- **Estimated Time**: 2 hours

### 4.2 Logging & Error Handling
- **Task**: Comprehensive logging system
- **Features**:
  - `logVerbose()` function
  - Error logging to `logs/errors.log`
  - Progress tracking
  - Rate limit monitoring
  - Verbosity control via `.env`
- **Dependencies**: All previous phases
- **Estimated Time**: 1 hour

### 4.3 Testing & Validation
- **Task**: Test scripts and validate functionality
- **Features**:
  - Test with small datasets
  - Validate API rate limit handling
  - Test error recovery
  - Validate backup system
  - Test playlist sorting
- **Dependencies**: All previous phases
- **Estimated Time**: 2 hours

## Implementation Order

### Week 1: Foundation
1. **Day 1**: Project setup (1.1, 1.2)
2. **Day 2**: Configuration system (1.3)
3. **Day 3**: OAuth 2.0 authentication setup (1.4)
4. **Day 4**: Video database builder (2.1)
5. **Day 5**: Playlist discovery (2.2)
6. **Day 6**: Playlist content builder (2.3)

### Week 2: Processing
1. **Day 1**: Video filtering system (3.1)
2. **Day 2-3**: Video processing engine (3.2)
3. **Day 4**: Playlist management (3.3)
4. **Day 5**: Integration and testing (4.1, 4.2, 4.3)

## Risk Mitigation

### API Rate Limits
- Implement rate limit tracking
- Add delays between API calls
- Resume capability for interrupted operations
- Test with small datasets first

### Data Integrity
- Backup before each operation
- Validate data consistency
- Prevent duplicate entries
- Handle partial failures gracefully

### Error Recovery
- Log current progress for resume
- Implement retry logic
- Graceful degradation
- Clear error messages

## Success Criteria

- [ ] All videos fetched and stored in `videos.json`
- [ ] All playlists discovered and cached
- [ ] Video filtering works correctly
- [ ] Video processing updates metadata successfully
- [ ] Playlist sorting works chronologically
- [ ] Error handling prevents data loss
- [ ] Rate limits respected throughout
- [ ] Logging provides clear progress tracking
