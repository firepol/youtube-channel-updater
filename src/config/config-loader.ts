import * as fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { 
  PlaylistConfig, 
  VideoProcessingConfig 
} from '../types/api-types';
import { getLogger } from '../utils/logger';

// Environment variables schema
const EnvSchema = z.object({
  // YouTube API Configuration
  YOUTUBE_API_KEY: z.string().min(1, 'YouTube API key is required'),
  YOUTUBE_CLIENT_ID: z.string().min(1, 'YouTube OAuth client ID is required'),
  YOUTUBE_CLIENT_SECRET: z.string().min(1, 'YouTube OAuth client secret is required'),
  YOUTUBE_REDIRECT_URI: z.string().url('Invalid redirect URI').default('http://localhost:3000/auth/callback'),
  
  // Channel Configuration
  YOUTUBE_CHANNEL_ID: z.string().min(1, 'YouTube channel ID is required'),
  
  // Application Settings
  VERBOSE: z.string().transform(val => val === 'true').default('false'),
  LOG_LEVEL: z.enum(['error', 'info', 'verbose']).default('info'),
  
  // Rate Limiting
  MAX_RETRIES: z.string().transform(val => parseInt(val, 10)).default('3'),
  RETRY_DELAY_MS: z.string().transform(val => parseInt(val, 10)).default('1000'),
  API_CALL_DELAY_MS: z.string().transform(val => parseInt(val, 10)).default('100'),
  
  // File Paths
  VIDEOS_DB_PATH: z.string().default('data/videos.json'),
  HISTORY_PATH: z.string().default('data/history.json'),
  PLAYLISTS_DIR: z.string().default('data/playlists/'),
  LOGS_DIR: z.string().default('logs/')
});

// Playlist configuration schema
const PlaylistRuleSchema = z.object({
  id: z.string().min(1, 'Playlist ID is required'),
  title: z.string().min(1, 'Playlist title is required'),
  description: z.string().optional(),
  keywords: z.array(z.string()).min(1, 'At least one keyword is required'),
  negativeKeywords: z.array(z.string()).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional()
});

const PlaylistConfigSchema = z.object({
  playlists: z.array(PlaylistRuleSchema)
});

// Video processing configuration schema
const VideoProcessingConfigSchema = z.object({
  titleTransform: z.object({
    pattern: z.string().min(1, 'Title transform pattern is required'),
    replacement: z.string()
  }).optional(),
  descriptionTransform: z.object({
    pattern: z.string().min(1, 'Description transform pattern is required'),
    replacement: z.string()
  }).optional(),
  titleTransforms: z.array(z.object({
    pattern: z.string().min(1, 'Title transform pattern is required'),
    replacement: z.string()
  })).optional(),
  descriptionTransforms: z.array(z.object({
    pattern: z.string().min(1, 'Description transform pattern is required'),
    replacement: z.string()
  })).optional(),
  titleBasedTags: z.array(z.object({
    pattern: z.string().min(1, 'Title-based tag pattern is required'),
    tags: z.array(z.string()).min(1, 'At least one tag is required'),
    caseSensitive: z.boolean().optional()
  })).optional(),
  baseTags: z.array(z.string()),
  maxDynamicTags: z.number().min(1).max(10).default(2),
  metadataVersion: z.string().min(1, 'Metadata version is required'),
  videoSettings: z.object({
    madeForKids: z.boolean().default(false),
    license: z.string().default('creativeCommon'),
    categoryId: z.string().default('20'), // Gaming category
    allowRemixing: z.boolean().default(true)
  }),
  recordingDateExtractPattern: z.string().optional(),
  // --- Add privacyRules ---
  privacyRules: z.object({
    videoTitleKeywords: z.record(z.string(), z.array(z.string())).optional(),
    defaultVideoPrivacy: z.object({
      publish: z.string(),
      draft: z.string()
    }).optional()
  }).optional()
});

// Configuration types
export interface AppConfig {
  youtube: {
    apiKey: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    channelId: string;
  };
  app: {
    verbose: boolean;
    logLevel: 'error' | 'info' | 'verbose';
  };
  rateLimiting: {
    maxRetries: number;
    retryDelayMs: number;
    apiCallDelayMs: number;
  };
  paths: {
    videosDb: string;
    history: string;
    playlistsDir: string;
    logsDir: string;
  };
  playlists: PlaylistConfig;
  videoProcessing: VideoProcessingConfig;
}

export class ConfigLoader {
  private config: AppConfig | null = null;

  /**
   * Load and validate all configuration
   */
  async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      // Load environment variables
      const env = await this.loadEnvironmentVariables();
      
      // Load playlist configuration
      const playlists = await this.loadPlaylistConfig();
      
      // Load video processing configuration
      const videoProcessing = await this.loadVideoProcessingConfig();

      this.config = {
        youtube: {
          apiKey: env.YOUTUBE_API_KEY,
          clientId: env.YOUTUBE_CLIENT_ID,
          clientSecret: env.YOUTUBE_CLIENT_SECRET,
          redirectUri: env.YOUTUBE_REDIRECT_URI,
          channelId: env.YOUTUBE_CHANNEL_ID
        },
        app: {
          verbose: env.VERBOSE,
          logLevel: env.LOG_LEVEL
        },
        rateLimiting: {
          maxRetries: env.MAX_RETRIES,
          retryDelayMs: env.RETRY_DELAY_MS,
          apiCallDelayMs: env.API_CALL_DELAY_MS
        },
        paths: {
          videosDb: env.VIDEOS_DB_PATH,
          history: env.HISTORY_PATH,
          playlistsDir: env.PLAYLISTS_DIR,
          logsDir: env.LOGS_DIR
        },
        playlists,
        videoProcessing
      };

      // Safe logger call - don't fail if logger isn't initialized yet
      try {
        getLogger().info('Configuration loaded successfully');
      } catch (error) {
        // Logger not initialized yet, that's okay
      }
      return this.config;
    } catch (error) {
      // Safe logger call - don't fail if logger isn't initialized yet
      try {
        getLogger().error('Failed to load configuration', error as Error);
      } catch (loggerError) {
        // Logger not initialized yet, use console as fallback
        console.error('Failed to load configuration:', error);
      }
      throw error;
    }
  }

  /**
   * Load basic configuration without playlist or video processing configs
   */
  async loadBasicConfig(): Promise<Pick<AppConfig, 'youtube' | 'app' | 'rateLimiting' | 'paths'>> {
    try {
      // Load environment variables
      const env = await this.loadEnvironmentVariables();

      return {
        youtube: {
          apiKey: env.YOUTUBE_API_KEY,
          clientId: env.YOUTUBE_CLIENT_ID,
          clientSecret: env.YOUTUBE_CLIENT_SECRET,
          redirectUri: env.YOUTUBE_REDIRECT_URI,
          channelId: env.YOUTUBE_CHANNEL_ID
        },
        app: {
          verbose: env.VERBOSE,
          logLevel: env.LOG_LEVEL
        },
        rateLimiting: {
          maxRetries: env.MAX_RETRIES,
          retryDelayMs: env.RETRY_DELAY_MS,
          apiCallDelayMs: env.API_CALL_DELAY_MS
        },
        paths: {
          videosDb: env.VIDEOS_DB_PATH,
          history: env.HISTORY_PATH,
          playlistsDir: env.PLAYLISTS_DIR,
          logsDir: env.LOGS_DIR
        }
      };
    } catch (error) {
      // Safe logger call - don't fail if logger isn't initialized yet
      try {
        getLogger().error('Failed to load basic configuration', error as Error);
      } catch (loggerError) {
        // Logger not initialized yet, use console as fallback
        console.error('Failed to load basic configuration:', error);
      }
      throw error;
    }
  }

  /**
   * Load and validate environment variables
   */
  private async loadEnvironmentVariables(): Promise<z.infer<typeof EnvSchema>> {
    // Load .env file if it exists
    const envPath = path.resolve(process.cwd(), '.env');
    if (await fs.pathExists(envPath)) {
      dotenv.config({ path: envPath });
    }

    try {
      return EnvSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingVars = error.errors.map(err => err.path.join('.')).join(', ');
        throw new Error(`Missing or invalid environment variables: ${missingVars}`);
      }
      throw error;
    }
  }

  /**
   * Load playlist configuration from JSON file
   */
  private async loadPlaylistConfig(): Promise<PlaylistConfig> {
    const configPath = path.resolve(process.cwd(), 'config', 'playlists.json');
    
    try {
      if (await fs.pathExists(configPath)) {
        const configData = await fs.readJson(configPath);
        
        // Fail-fast validation: Check all playlists have required fields
        if (Array.isArray(configData.playlists)) {
          for (let i = 0; i < configData.playlists.length; i++) {
            const playlist = configData.playlists[i];
            const errors: string[] = [];
            
            if (!playlist.id || typeof playlist.id !== 'string') {
              errors.push('id (required string)');
            }
            if (!playlist.title || typeof playlist.title !== 'string') {
              errors.push('title (required string)');
            }
            if (!Array.isArray(playlist.keywords) || playlist.keywords.length === 0) {
              errors.push('keywords (required non-empty array)');
            }
            
            if (errors.length > 0) {
              throw new Error(`Playlist at index ${i} is missing required fields: ${errors.join(', ')}`);
            }
          }
        }
        
        // After validation, we know all required fields are present
        return PlaylistConfigSchema.parse(configData) as PlaylistConfig;
      } else {
        // Return default empty configuration
        try {
          getLogger().warning('Playlist configuration file not found, using empty configuration');
        } catch (error) {
          // Logger not initialized yet, that's okay
        }
        return PlaylistConfigSchema.parse({ playlists: [] }) as PlaylistConfig;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Invalid playlist configuration: ${validationErrors}`);
      }
      throw error;
    }
  }

  /**
   * Load video processing configuration from JSON file
   */
  private async loadVideoProcessingConfig(): Promise<VideoProcessingConfig> {
    const configPath = path.resolve(process.cwd(), 'config', 'video-processing.json');
    
    try {
      if (await fs.pathExists(configPath)) {
        const configData = await fs.readJson(configPath);
        
        // Fail-fast validation: Check all required fields are present
        const errors: string[] = [];

        // Accept either single or multi-step transforms for title
        const hasTitleTransform = (
          configData.titleTransform?.pattern && typeof configData.titleTransform.pattern === 'string' &&
          configData.titleTransform?.replacement && typeof configData.titleTransform.replacement === 'string'
        );
        const hasTitleTransforms = (
          Array.isArray(configData.titleTransforms) && configData.titleTransforms.length > 0 &&
          typeof configData.titleTransforms[0].pattern === 'string' &&
          typeof configData.titleTransforms[0].replacement === 'string'
        );
        if (!hasTitleTransform && !hasTitleTransforms) {
          errors.push('titleTransform.pattern (required string) or titleTransforms (required array)');
        }

        // Accept either single or multi-step transforms for description
        const hasDescriptionTransform = (
          configData.descriptionTransform?.pattern && typeof configData.descriptionTransform.pattern === 'string' &&
          configData.descriptionTransform?.replacement && typeof configData.descriptionTransform.replacement === 'string'
        );
        const hasDescriptionTransforms = (
          Array.isArray(configData.descriptionTransforms) && configData.descriptionTransforms.length > 0 &&
          typeof configData.descriptionTransforms[0].pattern === 'string' &&
          typeof configData.descriptionTransforms[0].replacement === 'string'
        );
        if (!hasDescriptionTransform && !hasDescriptionTransforms) {
          errors.push('descriptionTransform.pattern (required string) or descriptionTransforms (required array)');
        }

        if (!Array.isArray(configData.baseTags)) {
          errors.push('baseTags (required array)');
        }
        if (typeof configData.maxDynamicTags !== 'number' || configData.maxDynamicTags < 1) {
          errors.push('maxDynamicTags (required positive number)');
        }
        if (!configData.metadataVersion || typeof configData.metadataVersion !== 'string') {
          errors.push('metadataVersion (required string)');
        }

        if (errors.length > 0) {
          throw new Error(`Video processing configuration is missing required fields: ${errors.join(', ')}`);
        }
        
        // After validation, we know all required fields are present
        return VideoProcessingConfigSchema.parse(configData) as VideoProcessingConfig;
      } else {
        // Return default configuration
        try {
          getLogger().warning('Video processing configuration file not found, using default configuration');
        } catch (error) {
          // Logger not initialized yet, that's okay
        }
        return this.getDefaultVideoProcessingConfig();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Invalid video processing configuration: ${validationErrors}`);
      }
      throw error;
    }
  }

  /**
   * Get default video processing configuration
   */
  private getDefaultVideoProcessingConfig(): VideoProcessingConfig {
    return {
      titleTransform: {
        pattern: 'Tom Clancy\'s The Division 2 (\\d{4}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (.+)',
        replacement: 'DZ $8 / The Division 2 / $1-$2-$3'
      },
      descriptionTransform: {
        pattern: 'Tom Clancy\'s The Division 2 (\\d{4}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2}) (\\d{2})',
        replacement: 'Tom Clancy\'s The Division 2 / $1-$2-$3 $4:$5'
      },
      baseTags: ['The Division 2', 'Gaming', 'Gameplay', 'Tom Clancy'],
      maxDynamicTags: 2,
      metadataVersion: 'v1.1',
      videoSettings: {
        madeForKids: false,
        license: 'creativeCommon',
        categoryId: '20', // Gaming category
        allowRemixing: true
      },
      recordingDateExtractPattern: '(?<year>\\d{4})[ .-]?(?<month>\\d{2})[ .-]?(?<day>\\d{2})[ .-]+(?<hour>\\d{2})[ .-]?(?<minute>\\d{2})[ .-]?(?<second>\\d{2})[ .-]?(?<centisecond>\\d{2})'
    };
  }

  /**
   * Create example configuration files
   */
  async createExampleConfigs(): Promise<void> {
    try {
      // Create config directory
      const configDir = path.resolve(process.cwd(), 'config');
      await fs.ensureDir(configDir);

      // Create example playlist configuration
      const examplePlaylists: PlaylistConfig = {
        playlists: [
          {
            id: 'PL_EXAMPLE_DARK_ZONE',
            title: 'Dark Zone',
            description: 'Dark Zone gameplay videos',
            keywords: ['DZ', 'dark zone', 'rogue', 'going rogue'],
            visibility: 'public'
          },
          {
            id: 'PL_EXAMPLE_MISSIONS',
            title: 'Missions',
            description: 'Mission gameplay videos',
            keywords: ['mission', 'story', 'campaign'],
            visibility: 'public'
          }
        ]
      };

      await fs.writeJson(
        path.join(configDir, 'playlists.example.json'),
        examplePlaylists,
        { spaces: 2 }
      );

      // Create example video processing configuration
      const exampleVideoProcessing = this.getDefaultVideoProcessingConfig();
      await fs.writeJson(
        path.join(configDir, 'video-processing.example.json'),
        exampleVideoProcessing,
        { spaces: 2 }
      );

      getLogger().success('Example configuration files created successfully');
    } catch (error) {
      getLogger().error('Failed to create example configuration files', error as Error);
      throw error;
    }
  }

  /**
   * Validate playlist configuration
   */
  validatePlaylistConfig(config: PlaylistConfig): void {
    try {
      PlaylistConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Invalid playlist configuration: ${validationErrors}`);
      }
      throw error;
    }
  }

  /**
   * Validate video processing configuration
   */
  validateVideoProcessingConfig(config: VideoProcessingConfig): void {
    try {
      VideoProcessingConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new Error(`Invalid video processing configuration: ${validationErrors}`);
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig | null {
    return this.config;
  }
}

// Convenience function to load configuration
export async function loadConfig(): Promise<AppConfig> {
  const loader = new ConfigLoader();
  return await loader.loadConfig();
} 