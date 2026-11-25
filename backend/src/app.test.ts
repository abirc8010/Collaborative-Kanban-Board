import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { config } from './config.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearSessionCookie, setSessionCookie, verifyCsrf } from './middleware/auth.js';

describe('HTTP API surface', () => {
  it('constructs frontend endpoints with exactly one /api prefix', () => {
    const apiSource = readFileSync(resolve(process.cwd(), '../frontend/src/services/api.ts'), 'utf8');
    expect(apiSource).toContain("const API_PREFIX = '/api';");
    expect(apiSource).not.toContain('/api/api');
    expect(apiSource).not.toContain('VITE_API_BASE_URL');
  });


  it('marks API responses private and prevents caching', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app.ts'), 'utf8');
    expect(source).toContain("private, no-store, max-age=0");
  });


  it('sets secure HttpOnly SameSite=Lax no-Domain session cookies in production', () => {
    const response = { setHeader: () => undefined } as unknown as import('express').Response;
    let headers: unknown;
    response.setHeader = ((_name: string, value: unknown) => { headers = value; }) as typeof response.setHeader;
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try { setSessionCookie(response, 'opaque-token', new Date(Date.now() + 60_000)); } finally { process.env.NODE_ENV = previous; }
    const cookie = String(headers);
    expect(cookie).toContain('kanban.sid=opaque-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
  });

  it('rejects state-changing requests with missing or mismatched CSRF tokens', () => {
    const request = { method: 'POST', user: { id: 'u1' }, sessionRecord: { csrfToken: 'secret-token' }, header: () => 'wrong-token' } as unknown as import('express').Request;
    let status: number | undefined;
    verifyCsrf(request, {} as import('express').Response, (error?: unknown) => { status = (error as { status?: number })?.status; });
    expect(status).toBe(403);
  });


  it('uses an effective frontend Vercel API rewrite and same-origin API client', () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), '../frontend/vercel.json'), 'utf8')) as { rewrites: Array<{ source: string; destination: string }> };
    const apiRewrite = vercel.rewrites.find((rewrite) => rewrite.source.startsWith('/api'));
    expect(apiRewrite?.destination).toContain('/api/:path*');
    expect(apiRewrite?.destination).toMatch(/^https:\/\//);
    const apiClient = readFileSync(resolve(process.cwd(), '../frontend/src/services/api.ts'), 'utf8');
    expect(apiClient).not.toContain('collaborative-kanban-api.onrender.com');
    expect(apiClient).toContain("const API_PREFIX = '/api';");
  });

  it('does not expose the Render host or session storage in the frontend', () => {
    const appSource = readFileSync(resolve(process.cwd(), '../frontend/src/App.tsx'), 'utf8');
    const apiSource = readFileSync(resolve(process.cwd(), '../frontend/src/services/api.ts'), 'utf8');
    expect(appSource).not.toContain('localStorage');
    expect(apiSource).not.toContain('localStorage');
  });
  it('reports database readiness through the health endpoint', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'disconnected' });
  });

  it('returns structured validation errors for invalid task input', async () => {
    const response = await request(app).post('/api/tasks').send({ title: '', assignee: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'title' }),
      expect.objectContaining({ field: 'assignee' }),
    ]));
  });

  it('rejects disallowed browser origins with a 403 JSON response', async () => {
    const previousOrigins = config.clientOrigins;
    const previousWildcard = config.allowAnyOrigin;
    config.clientOrigins = ['http://localhost:5173'];
    config.allowAnyOrigin = false;
    try {
      const response = await request(app).get('/api/health').set('Origin', 'https://not-allowed.example');
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Origin is not allowed by CORS' });
    } finally {
      config.clientOrigins = previousOrigins;
      config.allowAnyOrigin = previousWildcard;
    }
  });

  it('returns 404 for malformed task identifiers without querying MongoDB', async () => {
    const response = await request(app).patch('/api/tasks/not-an-object-id').send({ title: 'Updated title' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });
});
