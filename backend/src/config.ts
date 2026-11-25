import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? '',
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()),
  allowAnyOrigin: process.env.NODE_ENV !== 'production' && (process.env.CLIENT_ORIGIN ?? '').split(',').some((origin) => origin.trim() === '*'),
  simulateFailures: process.env.NODE_ENV !== 'production' && process.env.SIMULATE_API_FAILURE === 'true',
};
