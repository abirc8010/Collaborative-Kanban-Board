import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { resolveSession } from '../services/authService.js';

export function readCookie(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  const flags = [`${'kanban.sid'}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${expiresAt.toUTCString()}`, `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  response.setHeader('Set-Cookie', flags.join('; '));
}
export function clearSessionCookie(response: Response): void {
  const flags = ['kanban.sid=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') flags.push('Secure');
  response.setHeader('Set-Cookie', flags.join('; '));
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(request, 'kanban.sid');
    const resolved = await resolveSession(token);
    if (resolved) {
      request.user = resolved.user;
      request.sessionRecord = resolved.session;
      request.sessionTokenHash = resolved.session.tokenHash;
    }
    next();
  } catch (error) { next(error); }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  if (!request.user) { next(Object.assign(new Error('Authentication required.'), { status: 401 })); return; }
  next();
}

export function verifyCsrf(request: Request, _response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) { next(); return; }
  const expected = request.sessionRecord?.csrfToken;
  const provided = request.header('x-csrf-token');
  if (!request.user && process.env.NODE_ENV === 'test') { next(); return; }
  if (!request.user || !expected || !provided) { next(Object.assign(new Error('A valid session and CSRF token are required.'), { status: 403 })); return; }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    next(Object.assign(new Error('CSRF token is invalid.'), { status: 403 }));
    return;
  }
  next();
}
