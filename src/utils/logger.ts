// ============================================================
// FILE: src/utils/logger.ts (FIXED – no file logging in production)
// ============================================================

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Determine if we are in production
const isProduction = process.env.NODE_ENV === 'production';

// In production, we only log to console to avoid permission issues.
// In development, we attempt to create logs directory and use file transports.
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

if (!isProduction) {
  const logDir = path.join(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    transports.push(
      new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
    );
  } catch (err) {
    console.warn('⚠️ Could not set up file logging:', err);
  }
}

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports,
});

export default logger;
