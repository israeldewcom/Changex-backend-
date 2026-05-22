// ============================================
// FILE: src/app.ts (Perfect – no CORS/CSRF errors)
// ============================================
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

// ========== HELMET (secure HTTP headers) ==========
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

// ========== CORS (allow frontend origin) ==========
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl) or matching allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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

// ========== XSS sanitization ==========
app.use((req, res, next) => {
  if (req.body) {
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') return xss(obj);
      if (typeof obj === 'object' && obj !== null) {
        for (const key of Object.keys(obj)) {
          obj[key] = sanitize(obj[key]);
        }
      }
      return obj;
    };
    req.body = sanitize(req.body);
  }
  next();
});

// ========== CSRF protection (skip for auth, webhooks, GET) ==========
const csrfExcludedPaths = ['/api/v1/auth', '/api/v1/payments/webhook', '/webhooks'];
app.use((req, res, next) => {
  const shouldSkip = csrfExcludedPaths.some(path => req.path.startsWith(path)) || req.method === 'GET';
  if (shouldSkip) return next();
  simpleCsrf(req, res, next);
});

// ========== Rate limiting ==========
app.use(generalRateLimit);

// ========== API routes ==========
app.use('/api', routes);

// ========== Static files for certificates ==========
app.use('/certificates', express.static('public/certificates'));

// ========== Health check ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.env,
    uptime: process.uptime(),
  });
});

// ========== 404 handler ==========
app.use(notFound);

// ========== Global error handler ==========
app.use(errorHandler);

export default app;
