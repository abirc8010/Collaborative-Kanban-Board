import { z } from 'zod';

const linkAccessSchema = z.object({ enabled: z.boolean(), role: z.enum(['viewer', 'editor']) }).strict().refine((value) => value.enabled || value.role === 'viewer', 'Restricted access cannot have an editor link permission.');
export const createBoardSchema = z.object({ name: z.string().trim().min(1).max(80), visibility: z.enum(['public', 'private']).default('private') }).strict();
export const patchBoardSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), visibility: z.enum(['public', 'private']).optional(), linkAccess: linkAccessSchema.optional() }).strict().refine((value) => Object.keys(value).length > 0, 'At least one board field is required.').refine((value) => !(value.visibility && value.linkAccess), 'Specify either visibility or link access, not both.');
export const addMemberSchema = z.object({ username: z.string().trim().min(3).max(30), role: z.enum(['viewer', 'editor']) }).strict();
export const memberRoleSchema = z.object({ role: z.enum(['viewer', 'editor']) }).strict();
export const presenceHeartbeatSchema = z.object({ connectionId: z.string().uuid() }).strict();
