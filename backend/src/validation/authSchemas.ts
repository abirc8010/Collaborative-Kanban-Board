import { z } from 'zod';

export const usernameSchema = z.string().trim().min(3, 'Username must be at least 3 characters.').max(30, 'Username must be 30 characters or fewer.').regex(/^[A-Za-z0-9\-_]+$/, 'Use only letters, numbers, underscores, and hyphens.');
export const passwordSchema = z.string().min(12, 'Password must be at least 12 characters.').max(128, 'Password must be 128 characters or fewer.');
export const registerSchema = z.object({ username: usernameSchema, password: passwordSchema, confirmPassword: z.string().max(128, 'Password confirmation must be 128 characters or fewer.') }).strict().refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict();
