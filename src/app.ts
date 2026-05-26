import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from './routes';
import publicRoutes from './routes/public';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cookieParser());

app.use('/', publicRoutes);   // for /aff/... tracking
app.use('/api', routes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

export default app;
