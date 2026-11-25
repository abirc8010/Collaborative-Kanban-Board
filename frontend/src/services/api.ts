import type { Board, BoardEvent, LinkAccess, Task, TaskDraft, User, Visibility } from '../types';

const API_PREFIX = '/api';
let csrfToken = '';
export const setCsrfToken = (token: string) => { csrfToken = token; };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...init?.headers as Record<string, string> };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) headers['X-CSRF-Token'] = csrfToken;
  try { response = await fetch(`${API_PREFIX}${path}`, { ...init, credentials: 'include', headers }); }
  catch { throw new Error('Unable to reach the server. Check your connection and try again.'); }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (typeof body === 'object' && body !== null && 'details' in body && Array.isArray(body.details) && body.details.length) {
      const detail = body.details[0] as { message?: unknown };
      if (typeof detail.message === 'string' && detail.message) throw new Error(detail.message);
    }
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : 'The request could not be completed.';
    throw new Error(message);
  }
  return body as T;
}
export const api = {
  base: API_PREFIX,
  authMe: () => request<{ user: User; csrfToken: string; expiresAt: string }>('/auth/me'),
  register: (username: string, password: string, confirmPassword: string) => request<{ user: User; csrfToken: string; expiresAt: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, confirmPassword }) }),
  login: (username: string, password: string) => request<{ user: User; csrfToken: string; expiresAt: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  boards: () => request<{ boards: Board[] }>('/boards'),
  createBoard: (name: string, visibility: Visibility) => request<{ board: Board }>('/boards', { method: 'POST', body: JSON.stringify({ name, visibility }) }),
  getBoard: (boardId: string) => request<{ board: Board }>(`/boards/${encodeURIComponent(boardId)}`),
  updateBoard: (boardId: string, patch: { name?: string; visibility?: Visibility; linkAccess?: LinkAccess }) => request<{ board: Board }>(`/boards/${encodeURIComponent(boardId)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBoard: (boardId: string) => request<{ ok: boolean }>(`/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE', body: '{}' }),
  addMember: (boardId: string, username: string, role: 'viewer' | 'editor') => request<{ board: Board }>(`/boards/${encodeURIComponent(boardId)}/members`, { method: 'POST', body: JSON.stringify({ username, role }) }),
  updateMember: (boardId: string, userId: string, role: 'viewer' | 'editor') => request<{ board: Board }>(`/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (boardId: string, userId: string) => request<{ board: Board }>(`/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE', body: '{}' }),
  board: (boardId: string) => request<{ tasks: Task[] }>(`/board?boardId=${encodeURIComponent(boardId)}`),
  create: (boardId: string, draft: TaskDraft, mutationId: string) => request<{ task: Task }>('/tasks', { method: 'POST', body: JSON.stringify({ ...draft, boardId, mutationId }) }),
  update: (boardId: string, id: string, patch: Partial<TaskDraft> & { position?: number }, mutationId: string) => request<{ task: Task; affectedTasks: Task[] }>(`/tasks/${encodeURIComponent(id)}?boardId=${encodeURIComponent(boardId)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, mutationId }) }),
  remove: (boardId: string, id: string, mutationId: string) => request<{ deletedId: string; deletedAt: string; affectedTasks: Task[] }>(`/tasks/${encodeURIComponent(id)}?boardId=${encodeURIComponent(boardId)}`, { method: 'DELETE', body: JSON.stringify({ mutationId }) }),
  presenceHeartbeat: (boardId: string, connectionId: string) => request<{ ok: boolean }>(`/boards/${encodeURIComponent(boardId)}/presence/heartbeat`, { method: 'POST', body: JSON.stringify({ connectionId }) }),
  eventUrl: (boardId: string, connectionId: string) => `${API_PREFIX}/events?boardId=${encodeURIComponent(boardId)}&connectionId=${encodeURIComponent(connectionId)}`,
};
export function parseBoardEvent(event: MessageEvent<string>): BoardEvent {
  return JSON.parse(event.data) as BoardEvent;
}
