import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';
import { ensureAuthCollections } from './services/authService.js';
import { migrateLegacyBoardLinkAccess } from './services/boardService.js';

process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  console.error(`[STARTUP] Unhandled promise rejection: ${detail}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`[STARTUP] Uncaught exception: ${error.name}: ${error.message}`);
  process.exit(1);
});

function mongoErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; name?: string };
    if (candidate.code !== undefined) return `${candidate.name}: ${candidate.message} (code ${String(candidate.code)})`;
    return `${candidate.name}: ${candidate.message}`;
  }
  return String(error);
}

async function start(): Promise<void> {
  console.info('[STARTUP] Backend process starting');
  console.info('[STARTUP] Environment loaded');

  if (!config.mongoUri) {
    console.error('[STARTUP] MONGODB_URI is missing');
    process.exit(1);
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.info(`[SERVER] Listening on 0.0.0.0:${config.port}`);
  });

  server.on('error', (error) => {
    console.error(`[SERVER] Failed to listen on 0.0.0.0:${config.port}: ${mongoErrorDetail(error)}`);
    process.exit(1);
  });

  if (!config.mongoUri) return;

  console.info('[STARTUP] Connecting to MongoDB');
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
    console.info('[DATABASE] MongoDB connected');

    let initializationTimeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      ensureAuthCollections(),
      new Promise<never>((_, reject) => {
        initializationTimeout = setTimeout(() => reject(new Error('MongoDB collection initialization timed out after 20 seconds')), 20_000);
      }),
    ]);
    if (initializationTimeout) clearTimeout(initializationTimeout);
    await migrateLegacyBoardLinkAccess();
    console.info('[DATABASE] MongoDB collections initialized');
  } catch (error) {
    console.error(`[DATABASE] MongoDB connection or initialization failed: ${mongoErrorDetail(error)}`);
    await mongoose.disconnect().catch(() => undefined);
    server.close(() => process.exit(1));
  }
}

start().catch((error) => {
  console.error(`[STARTUP] Backend startup failed: ${mongoErrorDetail(error)}`);
  process.exit(1);
});
