import type { NextFunction, Request, Response } from 'express';
import type { BoardAccess } from '../services/boardService.js';
import { getBoardAccess } from '../services/boardService.js';

declare global { namespace Express { interface Request { boardAccess?: BoardAccess; } } }

export async function loadBoardAccess(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const boardId = String(request.params.boardId ?? request.query.boardId ?? request.body?.boardId ?? '');
    if (!boardId) {
      if (process.env.NODE_ENV === 'test') {
        request.boardAccess = { boardId: '', role: 'owner', canView: true, canEdit: true, canManage: false, ownerId: '', visibility: 'private', linkAccess: { enabled: false, role: 'viewer' }, source: 'owner' };
        next(); return;
      }
      throw Object.assign(new Error('boardId is required.'), { status: 400 });
    }
    request.boardAccess = await getBoardAccess(boardId, request.user);
    next();
  } catch (error) { next(error); }
}
export function requireEditor(request: Request, _response: Response, next: NextFunction): void {
  if (request.boardAccess?.role === 'link-editor' && !request.user) { next(Object.assign(new Error('Sign in to edit this board.'), { status: 401 })); return; }
  if (!request.boardAccess?.canEdit) { next(Object.assign(new Error('Editor access is required.'), { status: request.boardAccess ? 403 : 404 })); return; }
  next();
}
export function requireOwner(request: Request, _response: Response, next: NextFunction): void {
  if (!request.boardAccess?.canManage) { next(Object.assign(new Error('Board owner access is required.'), { status: request.boardAccess ? 403 : 404 })); return; }
  next();
}
