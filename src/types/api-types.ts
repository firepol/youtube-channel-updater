// YouTube API Response Types
export interface YouTubeVideo {
  id: string;
  snippet?: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      high?: { url: string; width: number; height: number };
    };
    tags?: string[];
    categoryId: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    channelId: string;
    channelTitle: string;
    liveBroadcastContent: string;
    localized?: {
      title: string;
      description: string;
    };
  };
  contentDetails?: {
    duration: string;
    dimension: {
      width: string;
      height: string;
    };
    definition?: string;
    caption?: string;
    licensedContent?: boolean;
    contentRating?: Record<string, string>;
    projection?: string;
  };
  status?: {
    uploadStatus: string;
    privacyStatus: string;
    license: string;
    embeddable?: boolean;
    publicStatsViewable?: boolean;
    madeForKids?: boolean;
  };
  recordingDate?: string;
  location?: {
    latitude: number;
    longitude: number;
    description: string;
  };
  topicCategories?: string[];
  topicDetails?: {
    topicIds: string[];
    relevantTopicIds: string[];
    topicCategories: string[];
  };
  liveStreamingDetails?: {
    actualStartTime: string;
    actualEndTime: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    concurrentViewers: string;
    activeLiveChatId: string;
  };
  processingDetails?: {
    processingStatus: string;
    processingProgress: {
      partsTotal: number;
      partsProcessed: number;
      timeLeftMs: number;
    };
    processingFailureReason: string;
    fileDetailsAvailability: string;
    processingIssuesAvailability: string;
    tagSuggestionsAvailability: string;
    editorSuggestionsAvailability: string;
    thumbnailsAvailability: string;
  };
  suggestions?: {
    processingErrors: string[];
    processingWarnings: string[];
    processingHints: string[];
    tagSuggestions: Array<{
      tag: string;
      categoryRestricts: string[];
    }>;
    editorSuggestions: string[];
  };
  statistics?: {
    viewCount: string;
    likeCount: string;
    dislikeCount: string;
    favoriteCount: string;
    commentCount: string;
  };
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
  };
  channelId: string;
  channelTitle: string;
  privacyStatus: string;
  itemCount: number;
  tags?: string[];
  defaultLanguage?: string;
  localized?: {
    title: string;
    description: string;
  };
}

export interface YouTubePlaylistItem {
  id: string;
  playlistId: string;
  position: number;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
  };
  resourceId: {
    kind: string;
    videoId: string;
  };
  videoOwnerChannelTitle?: string;
  videoOwnerChannelId?: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
  };
  country?: string;
  defaultLanguage?: string;
  statistics?: {
    viewCount: string;
    subscriberCount: string;
    hiddenSubscriberCount: boolean;
    videoCount: string;
  };
  status?: {
    privacyStatus: string;
    isLinked: boolean;
    longUploadsStatus: string;
    madeForKids: boolean;
    selfDeclaredMadeForKids: boolean;
  };
  brandingSettings?: {
    channel: {
      title: string;
      description: string;
      keywords: string;
      defaultTab: string;
      trackingAnalyticsAccountId: string;
      moderateComments: boolean;
      showRelatedChannels: boolean;
      showBrowseView: boolean;
      featuredChannelsTitle: string;
      featuredChannelsUrls: string[];
      unsubscribedTrailer: string;
      profileColor: string;
      defaultLanguage: string;
      country: string;
    };
    image: {
      bannerExternalUrl: string;
    };
  };
}

// API Response Wrapper Types
export interface YouTubeApiResponse<T> {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: T[];
}

// Local Database Types
export interface LocalVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  datetime?: string | undefined; // Extracted from filename/description
  tags?: string[] | undefined;
  categoryId: string;
  privacyStatus: string;
  madeForKids: boolean;
  license: string;
  recordingDate?: string | undefined;
  lastProcessed?: string | undefined;
  metadataVersion?: string | undefined;
  // Additional fields for filtering
  uploadStatus?: string | undefined;
  processingStatus?: string | undefined;
  embeddable?: boolean | undefined;
  publicStatsViewable?: boolean | undefined;
  definition?: string | undefined;
  caption?: string | undefined;
  defaultLanguage?: string | undefined;
  defaultAudioLanguage?: string | undefined;
  statistics?: {
    viewCount: string;
    likeCount: string;
    dislikeCount: string;
    favoriteCount: string;
    commentCount: string;
  } | undefined;
  processingErrors?: string[] | undefined;
  // Metadata tracking
  lastFetched: string; // When we last fetched this data
  lastUpdated: string; // When YouTube last updated this video
}

export interface LocalPlaylist {
  id: string;
  title: string;
  description: string;
  privacyStatus: string;
  itemCount: number;
  items: LocalPlaylistItem[];
}

export interface LocalPlaylistItem {
  position: number;
  videoId: string;
  title: string; // Retrieved from local video database
  publishedAt: string;
}

export interface ChangeHistory {
  date: string;
  videoId: string;
  field: 'title' | 'description' | 'tags' | 'settings';
  oldValue: string;
  newValue: string;
}

// Configuration Types
export interface PlaylistRule {
  id: string;
  title: string;
  description?: string | undefined;
  keywords: string[];
  visibility?: 'public' | 'private' | 'unlisted' | undefined;
}

export interface PlaylistConfig {
  playlists: PlaylistRule[];
}

export interface TitleTransform {
  pattern: string;
  replacement: string;
}

export interface DescriptionTransform {
  pattern: string;
  replacement: string;
}

export interface TitleBasedTagRule {
  pattern: string;
  tags: string[];
  caseSensitive?: boolean;
}

export interface VideoProcessingConfig {
  titleTransform?: TitleTransform;
  descriptionTransform?: DescriptionTransform;
  titleTransforms?: TitleTransform[];
  descriptionTransforms?: DescriptionTransform[];
  baseTags: string[];
  titleBasedTags?: TitleBasedTagRule[];
  maxDynamicTags: number;
  metadataVersion: string;
  videoSettings: {
    madeForKids: boolean;
    license: string;
    categoryId: string;
    allowRemixing: boolean;
    embeddable?: boolean;
    publicStatsViewable?: boolean;
  };
  recordingDateExtractPattern: string;
  // --- Added for privacy rules ---
  privacyRules?: {
    videoTitleKeywords?: {
      [privacy: string]: string[];
    };
    defaultVideoPrivacy?: {
      publish: string;
      draft: string;
    };
  };
}

// Error Types
export interface YouTubeApiError {
  code: number;
  message: string;
  errors: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

export interface RateLimitInfo {
  quotaUsed: number;
  quotaLimit: number;
  resetTime?: string | undefined;
} 