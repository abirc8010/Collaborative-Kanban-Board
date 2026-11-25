import { describe, expect, it } from 'vitest';
import { createTaskSchema, patchTaskSchema } from '../validation/taskSchemas.js';

describe('task request validation', () => {
  it('requires a title and assignee when creating a task', () => {
    expect(createTaskSchema.safeParse({ title: '', assignee: 'Maya' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'Ship board', assignee: 'Maya' }).success).toBe(true);
  });
  it('rejects invalid status, priority, and negative positions', () => {
    expect(patchTaskSchema.safeParse({ status: 'Archived' }).success).toBe(false);
    expect(patchTaskSchema.safeParse({ priority: 'urgent' }).success).toBe(false);
    expect(patchTaskSchema.safeParse({ position: -1 }).success).toBe(false);
  });
});
