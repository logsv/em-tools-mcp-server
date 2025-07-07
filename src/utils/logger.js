const winston = require('winston');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} | ${info.level.toUpperCase()} | ${info.message}`
  )
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console(),
    // File transport for errors
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // File transport for all logs
    new winston.transports.File({ filename: 'logs/combined.log' })
  ],
});

module.exports = logger;