import { z } from 'zod';
import { PRIORITIES, STATUSES } from '../models/Task.js';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().max(2000).optional().default(''),
  priority: z.enum(PRIORITIES).optional().default('medium'),
  assignee: z.string().trim().min(1, 'Assignee is required').max(80),
  status: z.enum(STATUSES).optional().default('Backlog'),
}).strict();

export const patchTaskSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().trim().min(1).max(80).optional(),
  status: z.enum(STATUSES).optional(),
  position: z.number().int().min(0).optional(),
  mutationId: z.string().min(1).max(100).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'mutationId'), 'At least one task field must be provided');

export const createMutationSchema = createTaskSchema.extend({ mutationId: z.string().min(1).max(100).optional(), boardId: z.string().optional() }).strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
