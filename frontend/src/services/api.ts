import type { BoardEvent, Task, TaskDraft } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '');
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('Backend URL is not configured. Set VITE_API_BASE_URL for this deployment.');
  let response: Response;
  try { response = await fetch(`${API_BASE}/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); }
  catch { throw new Error('Unable to reach the server. Check your connection and try again.'); }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : 'The request could not be completed.';
    throw new Error(message);
  }
  return body as T;
}
export const api = {
  base: API_BASE,
  board: () => request<{ tasks: Task[] }>('/board'),
  create: (draft: TaskDraft, mutationId: string) => request<{ task: Task }>('/tasks', { method: 'POST', body: JSON.stringify({ ...draft, mutationId }) }),
  update: (id: string, patch: Partial<TaskDraft> & { position?: number }, mutationId: string) => request<{ task: Task; affectedTasks: Task[] }>(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, mutationId }) }),
  remove: (id: string, mutationId: string) => request<{ deletedId: string; deletedAt: string; affectedTasks: Task[] }>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ mutationId }) }),
  eventUrl: () => API_BASE ? `${API_BASE}/api/events` : '',
};
export function parseBoardEvent(event: MessageEvent<string>): BoardEvent {
  return JSON.parse(event.data) as BoardEvent;
}
