import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import xss from 'xss';
import passport from './config/passport';
import { config } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalRateLimit } from './middleware/rateLimit';
import { simpleCsrf } from './middleware/csrf';
import routes from './routes';
import { logger } from './utils/logger';

const app = express();

// Helmet configuration (relaxed for PWA)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.s3.amazonaws.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      },
    },
  })
);

// CORS – allow frontend origin
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// XSS sanitization for request body
app.use((req, res, next) => {
  if (req.body) {
    const sanitizeObj = (obj: any): any => {
      if (typeof obj === 'string') return xss(obj);
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
          obj[key] = sanitizeObj(obj[key]);
        });
      }
      return obj;
    };
    req.body = sanitizeObj(req.body);
  }
  next();
});

// CSRF protection – skip for authentication routes and webhooks
app.use((req, res, next) => {
  const skipPaths = ['/api/v1/auth', '/webhooks'];
  const shouldSkip = skipPaths.some(path => req.path.startsWith(path)) || req.method === 'GET';
  if (shouldSkip) return next();
  simpleCsrf(req, res, next);
});

// Global rate limiting
app.use(generalRateLimit);

// API routes
app.use('/api', routes);

// Static certificates directory
app.use('/certificates', express.static('public/certificates'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// 404 handler
app.use(notFound);

// Central error handler
app.use(errorHandler);

export default app;
