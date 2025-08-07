const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logLevel = 'info') {
    this.logLevel = logLevel;
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };


    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.logFile = path.join(this.logDir, `chainwhisper-${new Date().toISOString().split('T')[0]}.log`);
  }

  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data
    };

    return JSON.stringify(logEntry);
  }

  writeToFile(formattedMessage) {
    try {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    } catch (error) {

      console.error('Failed to write to log file:', error.message);
    }
  }

  debug(message, data = null) {
    if (!this.shouldLog('debug')) return;

    const formattedMessage = this.formatMessage('debug', message, data);
    this.writeToFile(formattedMessage);

    console.log(chalk.gray(`🔍 DEBUG: ${message}`));
    if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
  }

  info(message, data = null) {
    if (!this.shouldLog('info')) return;

    const formattedMessage = this.formatMessage('info', message, data);
    this.writeToFile(formattedMessage);

    console.log(chalk.blue(`ℹ️  INFO: ${message}`));
    if (data) console.log(JSON.stringify(data, null, 2));
  }

  warn(message, data = null) {
    if (!this.shouldLog('warn')) return;

    const formattedMessage = this.formatMessage('warn', message, data);
    this.writeToFile(formattedMessage);

    console.log(chalk.yellow(`⚠️  WARN: ${message}`));
    if (data) console.log(chalk.yellow(JSON.stringify(data, null, 2)));
  }

  error(message, error = null, data = null) {
    if (!this.shouldLog('error')) return;

    const errorData = {
      ...data,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : null
    };

    const formattedMessage = this.formatMessage('error', message, errorData);
    this.writeToFile(formattedMessage);

    console.error(chalk.red(`❌ ERROR: ${message}`));
    if (error) console.error(chalk.red(error.message));
    if (data) console.error(chalk.red(JSON.stringify(data, null, 2)));
  }

  transaction(hash, type = 'unknown', data = null) {
    const message = `Transaction ${type}: ${hash}`;
    this.info(message, data);
    console.log(chalk.green(`📋 ${message}`));
  }

  gas(operation, gasUsed, gasPrice = null) {
    const message = `Gas usage for ${operation}: ${gasUsed}`;
    const gasData = { operation, gasUsed, gasPrice };

    this.info(message, gasData);
    console.log(chalk.blue(`⛽ ${message}`));
  }

  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.logLevel = level;
      this.info(`Log level changed to ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}. Available: ${Object.keys(this.logLevels).join(', ')}`);
    }
  }

  getLogLevel() {
    return this.logLevel;
  }


  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      files.forEach(file => {
        if (file.startsWith('chainwhisper-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            this.debug(`Cleaned up old log file: ${file}`);
          }
        }
      });
    } catch (error) {
      this.warn('Failed to cleanup old logs', { error: error.message });
    }
  }
}


const logger = new Logger(process.env.LOG_LEVEL || 'info');

module.exports = logger;
