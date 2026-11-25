import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { apiRouter } from './routes.js';
import { errorHandler } from './controllers/taskController.js';

export const app = express();
app.use(cors({ origin: (origin, callback) => {
  if (!origin || config.clientOrigins.includes('*') || config.clientOrigins.includes(origin)) callback(null, true);
  else callback(new Error('Origin is not allowed by CORS'));
} }));
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected' });
});
app.use('/api', apiRouter);
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);
