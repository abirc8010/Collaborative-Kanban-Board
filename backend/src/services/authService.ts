import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import mongoose, { Types } from 'mongoose';
import { BoardModel } from '../models/Board.js';
import { MigrationModel } from '../models/Migration.js';
import { SessionModel, type SessionRecord } from '../models/Session.js';
import { TaskModel } from '../models/Task.js';
import { UserModel, toUserRecord, type UserRecord } from '../models/User.js';
import { closeUserConnections } from '../events/broadcaster.js';

export const SESSION_COOKIE = 'kanban.sid';
const SESSION_DAYS = 7;
const passwordOptions = { type: argon2.argon2id as 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
export const normalizeUsername = (username: string) => username.trim().toLocaleLowerCase('en-US');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AuthResult { user: UserRecord; csrfToken: string; token: string; sessionId: string; expiresAt: Date; }
function createToken(): string { return randomBytes(32).toString('base64url'); }

async function createSession(userId: Types.ObjectId): Promise<AuthResult> {
  const token = createToken();
  const csrfToken = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await SessionModel.create({ tokenHash: hashToken(token), userId, csrfToken, expiresAt });
  const user = await UserModel.findById(userId).exec();
  if (!user) throw new Error('Registered user could not be loaded');
  return { user: toUserRecord(user), csrfToken, token, sessionId: String(session._id), expiresAt };
}

export async function registerUser(username: string, password: string): Promise<AuthResult> {
  const normalizedUsername = normalizeUsername(username);
  const session = await mongoose.startSession();
  let userId: Types.ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      const [created] = await UserModel.create([{ username: username.trim(), normalizedUsername, passwordHash: await argon2.hash(password, passwordOptions) }], { session });
      if (!created) throw new Error('Unable to create user');
      userId = created._id;
      const marker = await MigrationModel.findById('legacy-kanban-board-v1').session(session).exec();
      if (!marker) {
        const legacyFilter = { $or: [{ boardId: { $exists: false } }, { boardId: null }] };
        const legacyExists = await TaskModel.exists(legacyFilter).session(session);
        let boardId: Types.ObjectId | undefined;
        if (legacyExists) {
          const [board] = await BoardModel.create([{ name: 'Legacy board', ownerId: created._id, visibility: 'private', linkAccess: { enabled: false, role: 'viewer' }, members: [] }], { session });
          if (!board) throw new Error('Unable to create legacy board');
          boardId = board._id;
          await TaskModel.collection.updateMany(legacyFilter, { $set: { boardId } }, { session });
        }
        await MigrationModel.create([{ _id: 'legacy-kanban-board-v1', completedAt: new Date(), ...(boardId ? { boardId } : {}) }], { session });
      }
    });
  } catch (error) {
    const candidate = error as { code?: number; keyPattern?: Record<string, number> };
    if (candidate.code === 11000 && candidate.keyPattern?.normalizedUsername) throw Object.assign(new Error('That username is already taken. Try signing in or choose another username.'), { status: 409 });
    throw error;
  } finally { await session.endSession(); }
  if (!userId) throw new Error('Unable to complete registration');
  return createSession(userId);
}

export async function authenticateUser(username: string, password: string): Promise<AuthResult> {
  const user = await UserModel.findOne({ normalizedUsername: normalizeUsername(username) }).select('+passwordHash').exec();
  const valid = user ? await argon2.verify(user.passwordHash, password).catch(() => false) : false;
  if (!valid || !user) throw Object.assign(new Error('Invalid username or password.'), { status: 401 });
  return createSession(user._id);
}

export async function resolveSession(token: string | undefined): Promise<{ user: UserRecord; session: SessionRecord } | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await SessionModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).exec();
  if (!session) return null;
  const user = await UserModel.findById(session.userId).exec();
  if (!user) { await SessionModel.deleteOne({ _id: session._id }).exec(); return null; }
  return { user: toUserRecord(user), session: { id: String(session._id), userId: String(session.userId), tokenHash, csrfToken: session.csrfToken, expiresAt: session.expiresAt } };
}

export async function logoutSession(tokenHash: string): Promise<void> {
  await SessionModel.deleteOne({ tokenHash }).exec();
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, currentSessionId: string): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash').exec();
  if (!user || !await argon2.verify(user.passwordHash, currentPassword).catch(() => false)) {
    throw Object.assign(new Error('Current password is incorrect.'), { status: 400 });
  }
  user.passwordHash = await argon2.hash(newPassword, passwordOptions);
  await user.save();
  await SessionModel.deleteMany({ userId: user._id, _id: { $ne: currentSessionId } }).exec();
  closeUserConnections(userId, currentSessionId);
}

export async function ensureAuthCollections(): Promise<void> {
  await Promise.all([UserModel.init(), SessionModel.init(), BoardModel.init(), MigrationModel.init(), TaskModel.init()]);
}
