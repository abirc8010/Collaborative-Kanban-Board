import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';
import { seedIfEmpty } from './services/taskService.js';

async function start(): Promise<void> {
  if (!config.mongoUri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env and configure it.');
  await mongoose.connect(config.mongoUri);
  await seedIfEmpty();
  app.listen(config.port, () => console.info(`Kanban API listening on port ${config.port}`));
}

start().catch((error: unknown) => {
  console.error('Unable to start Kanban API:', error);
  process.exitCode = 1;
});
