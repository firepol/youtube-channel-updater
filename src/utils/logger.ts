import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  INFO = 'info',
  VERBOSE = 'verbose'
}

// Logger configuration
interface LoggerConfig {
  verbose: boolean;
  logLevel: LogLevel;
  logsDir: string;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    try {
      fs.ensureDirSync(this.config.logsDir);
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.getTimestamp();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private writeToFile(level: LogLevel, message: string): void {
    try {
      const logFile = path.join(this.config.logsDir, `${level}.log`);
      const formattedMessage = this.formatMessage(level, message);
      fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.INFO, LogLevel.VERBOSE];
    const configLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex <= configLevelIndex;
  }

  error(message: string, error?: Error): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const errorMessage = error ? `${message}: ${error.message}` : message;
    const formattedMessage = this.formatMessage(LogLevel.ERROR, errorMessage);
    
    console.error(chalk.red(formattedMessage));
    this.writeToFile(LogLevel.ERROR, errorMessage);
    
    // Always write errors to errors.log regardless of log level
    try {
      const errorsFile = path.join(this.config.logsDir, 'errors.log');
      const timestamp = this.getTimestamp();
      const errorLog = `[${timestamp}] ${errorMessage}${error?.stack ? '\n' + error.stack : ''}\n`;
      fs.appendFileSync(errorsFile, errorLog);
    } catch (writeError) {
      console.error('Failed to write to errors.log:', writeError);
    }
  }

  info(message: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formattedMessage = this.formatMessage(LogLevel.INFO, message);
    console.log(chalk.blue(formattedMessage));
    this.writeToFile(LogLevel.INFO, message);
  }

  verbose(message: string): void {
    if (!this.shouldLog(LogLevel.VERBOSE) || !this.config.verbose) return;

    const formattedMessage = this.formatMessage(LogLevel.VERBOSE, message);
    console.log(chalk.gray(formattedMessage));
    this.writeToFile(LogLevel.VERBOSE, message);
  }

  success(message: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formattedMessage = this.formatMessage(LogLevel.INFO, message);
    console.log(chalk.green(formattedMessage));
    this.writeToFile(LogLevel.INFO, message);
  }

  warning(message: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formattedMessage = this.formatMessage(LogLevel.INFO, message);
    console.log(chalk.yellow(formattedMessage));
    this.writeToFile(LogLevel.INFO, message);
  }

  progress(current: number, total: number, label: string = 'Progress'): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    const message = `${label}: ${progressBar} ${current}/${total} (${percentage}%)`;
    
    // Clear line and write progress
    process.stdout.write(`\r${chalk.cyan(message)}`);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  // Helper function for verbose logging (as specified in requirements)
  logVerbose(message: string): void {
    this.verbose(message);
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function initializeLogger(config: LoggerConfig): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
}

// Convenience function for verbose logging
export function logVerbose(message: string): void {
  if (globalLogger) {
    globalLogger.logVerbose(message);
  }
}

// Export the Logger class for direct usage if needed
export { Logger }; 