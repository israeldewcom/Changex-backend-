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

app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', 
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token'] 
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// XSS sanitization - skip for auth routes
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

// CSRF - skip public affiliate route and webhooks
app.use((req, res, next) => {
  if (req.path.includes('/webhooks') || req.method === 'GET' || req.path === '/health' || req.path.startsWith('/aff/')) {
    return next();
  }
  simpleCsrf(req, res, next);
});

app.use(generalRateLimit);
app.use('/', publicRoutes);     // <-- must be before /api
app.use('/api', routes);
app.use('/certificates', express.static('public/certificates'));

app.get('/health', (req, res) => { 
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), environment: config.env }); 
});

app.use(notFound);
app.use(errorHandler);

export default app;
