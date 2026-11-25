import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { createMutationSchema, createTaskSchema, patchTaskSchema } from '../validation/taskSchemas.js';
import { createTask, deleteTask, listTasks, updateTask } from '../services/taskService.js';
import { config } from '../config.js';

function maybeFail(): void {
  if (config.simulateFailures) throw Object.assign(new Error('Development failure simulation is enabled.'), { status: 503 });
}

export async function getBoard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ tasks: await listTasks(String(_req.boardAccess?.boardId)) }); } catch (error) { next(error); }
}
export async function postTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    maybeFail();
    const parsed = createMutationSchema.parse(req.body);
    const { mutationId, boardId: _boardId, ...input } = parsed;
    res.status(201).json({ task: await createTask(String(req.boardAccess?.boardId), createTaskSchema.parse(input), mutationId) });
  } catch (error) { next(error); }
}
export async function patchTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    maybeFail();
    const input = patchTaskSchema.parse(req.body);
    res.json(await updateTask(String(req.boardAccess?.boardId), String(req.params.id ?? ''), input));
  } catch (error) { next(error); }
}
export async function removeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    maybeFail();
    const mutationId = typeof req.body?.mutationId === 'string' ? req.body.mutationId : undefined;
    res.json(await deleteTask(String(req.boardAccess?.boardId), String(req.params.id ?? ''), mutationId));
  } catch (error) { next(error); }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    const confirmation = details.find((detail) => detail.field === 'confirmPassword');
    const password = details.find((detail) => detail.field === 'password');
    const username = details.find((detail) => detail.field === 'username');
    const message = confirmation?.message ?? password?.message ?? username?.message ?? 'Validation failed';
    res.status(400).json({ error: message, details });
    return;
  }
  const candidate = error as { status?: number; message?: string };
  const status = candidate.status && candidate.status >= 400 && candidate.status < 600 ? candidate.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : candidate.message ?? 'Request failed' });
}
