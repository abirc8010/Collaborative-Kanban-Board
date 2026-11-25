import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('HTTP API surface', () => {
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

  it('returns 404 for malformed task identifiers without querying MongoDB', async () => {
    const response = await request(app).patch('/api/tasks/not-an-object-id').send({ title: 'Updated title' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Task not found' });
  });
});
