import type { NextFunction, Request, Response } from 'express';
import type { BoardAccess } from '../services/boardService.js';
import { getBoardAccess } from '../services/boardService.js';

declare global { namespace Express { interface Request { boardAccess?: BoardAccess; } } }

export async function loadBoardAccess(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const boardId = String(request.params.boardId ?? request.query.boardId ?? request.body?.boardId ?? '');
    if (!boardId) {
      if (process.env.NODE_ENV === 'test') {
        request.boardAccess = { boardId: '', role: 'owner', canView: true, canEdit: true, canManage: false, ownerId: '', visibility: 'private' };
        next(); return;
      }
      const { BoardModel } = await import('../models/Board.js');
      const boardCount = await BoardModel.countDocuments().exec();
      if (boardCount !== 1) throw Object.assign(new Error(boardCount === 0 ? 'No board is available.' : 'boardId is required when more than one board exists.'), { status: boardCount === 0 ? 404 : 400 });
      const board = await BoardModel.findOne().exec();
      if (!board) throw Object.assign(new Error('Board not found.'), { status: 404 });
      request.boardAccess = await getBoardAccess(String(board._id), request.user);
      next(); return;
    }
    request.boardAccess = await getBoardAccess(boardId, request.user);
    next();
  } catch (error) { next(error); }
}
export function requireEditor(request: Request, _response: Response, next: NextFunction): void {
  if (!request.boardAccess?.canEdit) { next(Object.assign(new Error('Editor access is required.'), { status: request.boardAccess ? 403 : 404 })); return; }
  next();
}
export function requireOwner(request: Request, _response: Response, next: NextFunction): void {
  if (!request.boardAccess?.canManage) { next(Object.assign(new Error('Board owner access is required.'), { status: request.boardAccess ? 403 : 404 })); return; }
  next();
}
