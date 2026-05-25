import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import xss from 'xss';
import passport from 'passport';
import { config } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalRateLimit } from './middleware/rateLimit';
import { simpleCsrf } from './middleware/csrf';
import routes from './routes';
import publicRoutes from './routes/public';
import './config/passport';
import { logger } from './utils/logger';

const app = express();

// CORS – allow your Vercel frontend
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    const allowed = [
      'https://adc-mu.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      // TEMPORARILY ACCEPT ANY ORIGIN FOR DEBUGGING – REMOVE AFTER CONFIRMATION
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token']
}));

app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' }, 
  contentSecurityPolicy: { 
    directives: { 
      defaultSrc: ["'self'"], 
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], 
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.s3.amazonaws.com'], 
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"] 
    } 
  } 
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// XSS sanitization – skip for auth routes (preserve email format)
app.use((req, res, next) => {
  if (req.path.includes('/auth/') || req.path.includes('/login') || req.path.includes('/register')) {
    return next();
  }
  if (req.body && typeof req.body === 'object') {
    const sanitizeObj = (obj: any): any => {
      if (typeof obj === 'string') {
        return xss(obj);
      }
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          obj[key] = sanitizeObj(obj[key]);
        });
      }
      return obj;
    };
    req.body = sanitizeObj(req.body);
  }
  next();
});

// CSRF – skip for auth, webhooks, and public affiliate routes
app.use((req, res, next) => {
  if (
    req.path.includes('/webhooks') ||
    req.method === 'GET' ||
    req.path === '/health' ||
    req.path.startsWith('/aff/') ||
    req.path.includes('/auth/') ||
    req.path.includes('/login')
  ) {
    return next();
  }
  simpleCsrf(req, res, next);
});

app.use(generalRateLimit);
app.use('/', publicRoutes);      // MUST be before /api
app.use('/api', routes);
app.use('/certificates', express.static('public/certificates'));

app.get('/health', (req, res) => { 
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), environment: config.env }); 
});

app.use(notFound);
app.use(errorHandler);

export default app;
