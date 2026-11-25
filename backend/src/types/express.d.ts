import type { UserRecord } from '../models/User.js';
import type { SessionRecord } from '../models/Session.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      sessionRecord?: SessionRecord;
      sessionTokenHash?: string;
    }
  }
}

export {};
