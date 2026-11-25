import type { NextFunction, Request, Response } from 'express';
import { changePasswordSchema, loginSchema, registerSchema } from '../validation/authSchemas.js';
import { authenticateUser, changePassword as changePasswordService, logoutSession, registerUser } from '../services/authService.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import { closeSessionConnections } from '../events/broadcaster.js';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input.username, input.password);
    setSessionCookie(res, result.token, result.expiresAt);
    res.status(201).json({ user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() });
  } catch (error) { next(error); }
}
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authenticateUser(input.username, input.password);
    setSessionCookie(res, result.token, result.expiresAt);
    res.json({ user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() });
  } catch (error) { next(error); }
}
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.sessionRecord) { res.status(401).json({ error: 'Authentication required.' }); return; }
  res.json({ user: req.user, csrfToken: req.sessionRecord.csrfToken, expiresAt: req.sessionRecord.expiresAt.toISOString() });
}
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.sessionTokenHash) await logoutSession(req.sessionTokenHash);
    if (req.sessionRecord) closeSessionConnections(req.sessionRecord.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) { next(error); }
}
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.sessionRecord) throw Object.assign(new Error('Authentication required.'), { status: 401 });
    const input = changePasswordSchema.parse(req.body);
    await changePasswordService(req.user.id, input.currentPassword, input.newPassword, req.sessionRecord.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}
