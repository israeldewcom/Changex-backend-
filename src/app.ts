// ============================================
// FILE: src/app.ts (Complete & Production-Ready)
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

// ========== Security Headers ==========
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

// ========== CORS (Allow Frontend Only) ==========
const allowedOrigins = [config.frontendUrl, 'http://localhost:3000', 'http://localhost:3001'];
app.use(
  cors({
    origin: (origin, callback) => {
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

// ========== Standard Middleware ==========
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ========== Passport (OAuth) ==========
app.use(passport.initialize());

// ========== XSS Sanitization ==========
app.use((req, res, next) => {
  if (req.body) {
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') return xss(obj);
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
          obj[key] = sanitize(obj[key]);
        });
      }
      return obj;
    };
    req.body = sanitize(req.body);
  }
  next();
});

// ========== CSRF Protection (Skip Auth & Webhooks) ==========
app.use((req, res, next) => {
  const skipPaths = ['/api/v1/auth', '/webhooks'];
  const shouldSkip = skipPaths.some(path => req.path.startsWith(path)) || req.method === 'GET';
  if (shouldSkip) return next();
  simpleCsrf(req, res, next);
});

// ========== Rate Limiting ==========
app.use(generalRateLimit);

// ========== API Routes ==========
app.use('/api', routes);

// ========== Static Files ==========
app.use('/certificates', express.static('public/certificates'));

// ========== Health Check ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.env,
    uptime: process.uptime(),
  });
});

// ========== 404 & Error Handling ==========
app.use(notFound);
app.use(errorHandler);

export default app;
