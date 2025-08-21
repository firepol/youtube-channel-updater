#!/usr/bin/env tsx

import { YouTubeClient } from '../src/api/youtube-client';
import { ConfigLoader } from '../src/config/config-loader';
import { initializeLogger, LogLevel } from '../src/utils/logger';
import * as readline from 'readline';
import * as fs from 'fs-extra';

class OAuthSetup {
  private youtubeClient!: YouTubeClient;
  private logger: any;

  /**
   * Initialize the OAuth setup
   */
  async initialize(): Promise<void> {
    try {
      // Load basic configuration
      const configLoader = new ConfigLoader();
      const basicConfig = await configLoader.loadBasicConfig();

      // Initialize logger
      this.logger = initializeLogger({
        verbose: basicConfig.app.verbose,
        logLevel: basicConfig.app.logLevel as LogLevel,
        logsDir: basicConfig.paths.logsDir
      });

      // Initialize YouTube client
      this.youtubeClient = new YouTubeClient(
        basicConfig.youtube.apiKey,
        basicConfig.youtube.clientId,
        basicConfig.youtube.clientSecret,
        basicConfig.youtube.channelId,
        basicConfig.rateLimiting.maxRetries,
        basicConfig.rateLimiting.retryDelayMs,
        basicConfig.rateLimiting.apiCallDelayMs
      );

      // Load OAuth tokens if available
      const tokensLoaded = await this.youtubeClient.loadTokens();
      if (tokensLoaded) {
        this.logger.info('OAuth tokens loaded successfully');
        
        // Check if tokens are expired immediately after loading
        await this.checkTokenExpiry();
      } else {
        this.logger.info('No OAuth tokens found - authentication required');
      }

      this.logger.info('OAuth setup initialized');
    } catch (error) {
      console.error('Failed to initialize OAuth setup:', error);
      process.exit(1);
    }
  }

  /**
   * Generate authorization URL
   */
  generateAuthUrl(): string {
    return this.youtubeClient.generateAuthUrl();
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<any> {
    try {
      const tokens = await this.youtubeClient.getTokensFromCode(code);
      await this.youtubeClient.saveTokens(tokens, 'token.json');
      return tokens;
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error as Error);
      throw error;
    }
  }

  /**
   * Check if OAuth tokens are expired
   */
  private async checkTokenExpiry(): Promise<boolean> {
    try {
      const tokenPath = 'token.json';
      if (await fs.pathExists(tokenPath)) {
        const tokens = await fs.readJson(tokenPath);
        
        // Check if expiry_date exists and if token is expired
        if (tokens.expiry_date) {
          const currentTime = Date.now();
          const expiryTime = tokens.expiry_date;
          
          if (currentTime > expiryTime) {
            // Delete expired token file
            await fs.remove(tokenPath);
            console.log('You need to authenticate again. Please run the setup command.');
            
            return true; // Token was expired
          } else {
            const timeUntilExpiry = expiryTime - currentTime;
            const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
            const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));
            
            console.log(`OAuth tokens are valid for ${hoursUntilExpiry}h ${minutesUntilExpiry}m`);
            return false; // Token is not expired
          }
        } else {
          await fs.remove(tokenPath);
          console.log('Deleted token.json file (no expiry date)');
          return true; // Treat as expired
        }
      }
      return false; // No tokens found
    } catch (error) {
      this.logger.error('Error checking token expiry:', error as Error);
      return false;
    }
  }

  /**
   * Check if already authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    // First check if tokens are expired
    const isExpired = await this.checkTokenExpiry();
    if (isExpired) {
      return false;
    }
    
    // Then check if authenticated
    return this.youtubeClient.isAuthenticated();
  }

  /**
   * Interactive OAuth setup
   */
  async setupOAuth(): Promise<void> {
    try {
      // Check if already authenticated
      if (await this.isAuthenticated()) {
        this.logger.success('Already authenticated with OAuth!');
        return;
      }

      this.logger.info('Starting OAuth setup...');
      this.logger.info('This will open a browser window for YouTube authentication.');
      this.logger.info('After authentication, you will be redirected to a URL with an authorization code.');
      this.logger.info('Copy the authorization code from the URL and paste it here.');

      // Generate authorization URL
      const authUrl = this.generateAuthUrl();
      this.logger.info(`\nAuthorization URL: ${authUrl}`);
      this.logger.info('\nPlease open this URL in your browser and complete the authentication.');

      // Wait for user to provide the authorization code
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const code = await new Promise<string>((resolve) => {
        rl.question('\nEnter the authorization code from the URL: ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!code) {
        this.logger.error('No authorization code provided');
        return;
      }

      // Exchange code for tokens
      this.logger.info('Exchanging authorization code for tokens...');
      await this.exchangeCodeForTokens(code);

      this.logger.success('OAuth authentication completed successfully!');
      this.logger.info('Tokens have been saved to token.json');
      this.logger.info('You can now run discover-playlists to see all your playlists including unlisted ones.');

    } catch (error) {
      this.logger.error('OAuth setup failed', error as Error);
      throw error;
    }
  }

  /**
   * Test OAuth authentication
   */
  async testAuthentication(): Promise<void> {
    try {
      if (!await this.isAuthenticated()) {
        this.logger.error('Not authenticated with OAuth');
        return;
      }

      this.logger.info('Testing OAuth authentication...');
      
      // Try to get playlists with OAuth
      const response = await this.youtubeClient.getPlaylists();
      
      this.logger.success('OAuth authentication test successful!');
      this.logger.info(`Found ${response.items.length} playlists`);
      
      // Show playlist details
      for (const playlist of response.items) {
        this.logger.info(`  - ${playlist.title} (${playlist.privacyStatus})`);
      }

    } catch (error) {
      this.logger.error('OAuth authentication test failed', error as Error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const oauthSetup = new OAuthSetup();
  
  try {
    await oauthSetup.initialize();

    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'test':
        await oauthSetup.testAuthentication();
        break;
      case 'setup':
      default:
        await oauthSetup.setupOAuth();
        break;
    }

  } catch (error) {
    console.error('OAuth setup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
} 