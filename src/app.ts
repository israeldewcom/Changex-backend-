import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalRateLimit } from './middleware/rateLimit';
import routes from './routes';
import publicRoutes from './routes/public';
import { logger } from './utils/logger';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(generalRateLimit);
app.use('/', publicRoutes);
app.use('/api', routes);
app.use('/certificates', express.static('public/certificates'));

app.get('/health', (req, res) => { res.json({ status: 'healthy', timestamp: new Date().toISOString(), environment: config.env }); });

app.use(notFound);
app.use(errorHandler);

export default app;
