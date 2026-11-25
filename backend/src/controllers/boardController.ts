import type { NextFunction, Request, Response } from 'express';
import { addMemberSchema, createBoardSchema, memberRoleSchema, patchBoardSchema, presenceHeartbeatSchema } from '../validation/boardSchemas.js';
import { addBoardMember, createBoard, deleteBoard, getBoard, getBoardAccess, listUserBoards, removeBoardMember, updateBoard, updateBoardMember } from '../services/boardService.js';
import { acknowledgePresence, connectBoardClient } from '../events/broadcaster.js';

export async function listBoards(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  res.json({ boards: await listUserBoards(req.user.id) });
}
export async function createBoardController(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  const input = createBoardSchema.parse(req.body);
  res.status(201).json({ board: await createBoard(req.user.id, input.name, input.visibility) });
}
export async function readBoard(req: Request, res: Response): Promise<void> {
  res.json({ board: await getBoard(String(req.params.boardId), req.user?.id) });
}
export async function patchBoard(req: Request, res: Response): Promise<void> {
  const input = patchBoardSchema.parse(req.body);
  res.json({ board: await updateBoard(String(req.params.boardId), input) });
}
export async function deleteBoardController(req: Request, res: Response): Promise<void> {
  await deleteBoard(String(req.params.boardId));
  res.json({ ok: true });
}
export async function addMember(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  const input = addMemberSchema.parse(req.body);
  res.status(201).json({ board: await addBoardMember(String(req.params.boardId), input.username, input.role, req.user.id) });
}
export async function patchMember(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  const input = memberRoleSchema.parse(req.body);
  res.json({ board: await updateBoardMember(String(req.params.boardId), String(req.params.userId), input.role, req.user.id) });
}
export async function deleteMemberController(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  res.json({ board: await removeBoardMember(String(req.params.boardId), String(req.params.userId), req.user.id) });
}
export async function connectToBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boardId = String(req.query.boardId ?? '');
    const connectionId = String(req.query.connectionId ?? '');
    if (!boardId || !/^[0-9a-f-]{36}$/i.test(connectionId)) { res.status(400).json({ error: 'boardId and a valid connectionId are required.' }); return; }
    const access = await getBoardAccess(boardId, req.user);
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const sessionId = req.sessionRecord?.id ?? null;
    const cleanup = connectBoardClient(res, boardId, { connectionId, userId: req.user?.id ?? null, username: req.user?.username ?? null, role: access.role, sessionId, expiresAt: req.sessionRecord?.expiresAt.getTime() ?? null });
    res.on('close', cleanup);
  } catch (error) { next(error); }
}
export async function presenceHeartbeat(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Authentication required.' }); return; }
  const { connectionId } = presenceHeartbeatSchema.parse(req.body);
  const boardId = String(req.params.boardId);
  await getBoardAccess(boardId, req.user);
  if (!acknowledgePresence(boardId, req.user.id, connectionId)) { res.status(404).json({ error: 'Presence connection is no longer active.' }); return; }
  res.json({ ok: true });
}
