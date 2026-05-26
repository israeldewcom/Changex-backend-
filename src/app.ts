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
import routes from './routes';
import publicRoutes from './routes/public';
import './config/passport';
import { logger } from './utils/logger';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

app.use((req, res, next) => {
  if (req.path.includes('/auth/') || req.path.includes('/login') || req.path.includes('/register')) {
    return next();
  }
  if (req.body && typeof req.body === 'object') {
    const sanitizeObj = (obj: any): any => {
      if (typeof obj === 'string') return xss(obj);
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => { obj[key] = sanitizeObj(obj[key]); });
      }
      return obj;
    };
    req.body = sanitizeObj(req.body);
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.includes('/webhooks') || req.method === 'GET' || req.path === '/health' || req.path.startsWith('/aff/') || req.path.includes('/auth/') || req.path.includes('/login') || req.path.includes('/courses') || req.path.includes('/instructor') || req.path.includes('/affiliate') || req.path.includes('/payments') || req.path.includes('/users')) {
    return next();
  }
  next();
});

app.use(generalRateLimit);
app.use('/', publicRoutes);
app.use('/api', routes);
app.use('/certificates', express.static('public/certificates'));

app.get('/health', (req, res) => { res.json({ status: 'healthy', timestamp: new Date().toISOString(), environment: config.env }); });

app.use(notFound);
app.use(errorHandler);

export default app;
