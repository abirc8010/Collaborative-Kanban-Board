import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

export type BoardEventName = 'task-created' | 'task-updated' | 'task-deleted' | 'board:members-changed' | 'presence:snapshot' | 'presence:joined' | 'presence:left' | 'presence:heartbeat' | 'board:access-revoked';
export interface BoardEvent<T = unknown> { eventId?: string; boardId: string; type: BoardEventName; mutationId: string | null; data: T; }
export interface StreamIdentity { connectionId: string; userId: string | null; username: string | null; role: string; sessionId: string | null; expiresAt: number | null; }
interface StreamClient { boardId: string; response: Response; identity: StreamIdentity; lastSeen: number; }
const boards = new Map<string, Map<string, StreamClient>>();
const legacyClients = new Set<Response>();
let heartbeat: ReturnType<typeof setInterval> | undefined;
const PRESENCE_LEASE_MS = 180_000;

function write(client: Response, event: BoardEvent): void {
  const identified = { ...event, eventId: event.eventId ?? randomUUID() };
  client.write(`id: ${identified.eventId}\nevent: ${identified.type}\ndata: ${JSON.stringify(identified)}\n\n`);
}
function members(boardId: string): Map<string, StreamClient> {
  let entries = boards.get(boardId);
  if (!entries) { entries = new Map(); boards.set(boardId, entries); }
  return entries;
}
function send(boardId: string, type: BoardEventName, data: unknown, mutationId: string | null = null, exceptConnectionId?: string): void {
  const event: BoardEvent = { boardId, type, mutationId, data };
  for (const client of boards.get(boardId)?.values() ?? []) {
    if (client.identity.role === 'public' && (type === 'board:members-changed' || type === 'presence:snapshot' || type === 'presence:joined' || type === 'presence:left' || type === 'presence:heartbeat')) continue;
    if (client.identity.connectionId === exceptConnectionId) continue;
    try { write(client.response, event); } catch { removeClient(client, true); }
  }
}
function visibleUsers(boardId: string): Array<{ userId: string; username: string }> {
  const unique = new Map<string, string>();
  for (const client of boards.get(boardId)?.values() ?? []) if (client.identity.userId && client.identity.username) unique.set(client.identity.userId, client.identity.username);
  return [...unique.entries()].map(([userId, username]) => ({ userId, username }));
}
function removeClient(client: StreamClient, endConnection: boolean, announcePresence = true): void {
  const entries = boards.get(client.boardId);
  if (!entries || entries.get(client.identity.connectionId) !== client) return;
  entries.delete(client.identity.connectionId);
  if (announcePresence && client.identity.userId && ![...entries.values()].some((entry) => entry.identity.userId === client.identity.userId)) {
    send(client.boardId, 'presence:left', { boardId: client.boardId, userId: client.identity.userId, username: client.identity.username }, null, client.identity.connectionId);
  }
  if (entries.size === 0) boards.delete(client.boardId);
  if (endConnection && !client.response.writableEnded) client.response.end();
  if (boards.size === 0 && heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
}

export function connectBoardClient(response: Response, boardId: string, identity: StreamIdentity): () => void {
  const entries = members(boardId);
  const existingConnection = entries.get(identity.connectionId);
  if (existingConnection) removeClient(existingConnection, true, false);
  const isFirstTab = identity.userId !== null && ![...entries.values()].some((entry) => entry.identity.userId === identity.userId);
  const client: StreamClient = { boardId, response, identity, lastSeen: Date.now() };
  entries.set(identity.connectionId, client);
  if (identity.userId) {
    try { write(response, { boardId, type: 'presence:snapshot', mutationId: null, data: { boardId, users: visibleUsers(boardId) } }); } catch { removeClient(client, true); }
    if (isFirstTab) send(boardId, 'presence:joined', { boardId, userId: identity.userId, username: identity.username }, null, identity.connectionId);
  }
  ensureHeartbeat();
  return () => removeClient(client, false);
}

function ensureHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [currentBoardId, currentClients] of boards) for (const current of [...currentClients.values()]) {
      if (current.identity.expiresAt !== null && now >= current.identity.expiresAt) { closeClientWithRevocation(current); continue; }
      if (current.identity.userId && now - current.lastSeen > PRESENCE_LEASE_MS) { removeClient(current, true); continue; }
      try {
        current.response.write(': heartbeat\n\n');
        if (current.identity.userId) write(current.response, { boardId: currentBoardId, type: 'presence:heartbeat', mutationId: null, data: { boardId: currentBoardId, connectionId: current.identity.connectionId } });
      } catch { removeClient(current, true); }
    }
  }, 20_000);
}

export function broadcast(event: BoardEvent): void {
  if (event.boardId) send(event.boardId, event.type, event.data, event.mutationId);
  const identified = { ...event, eventId: event.eventId ?? randomUUID() };
  for (const client of legacyClients) {
    try { write(client, identified); } catch { legacyClients.delete(client); }
  }
}
export function broadcastToBoard(boardId: string, type: BoardEventName, data: unknown): void { send(boardId, type, data); }
export function acknowledgePresence(boardId: string, userId: string, connectionId: string): boolean {
  const client = boards.get(boardId)?.get(connectionId);
  if (!client || client.identity.userId !== userId) return false;
  client.lastSeen = Date.now();
  return true;
}
export function updateBoardMemberRole(boardId: string, userId: string, role: string): void {
  for (const client of [...(boards.get(boardId)?.values() ?? [])].filter((entry) => entry.identity.userId === userId)) client.identity.role = role;
}
export function closeBoardMember(boardId: string, userId: string): void {
  for (const client of [...(boards.get(boardId)?.values() ?? [])].filter((entry) => entry.identity.userId === userId)) closeClientWithRevocation(client);
}
function closeClientWithRevocation(client: StreamClient): void {
  try { write(client.response, { boardId: client.boardId, type: 'board:access-revoked', mutationId: null, data: { boardId: client.boardId } }); } finally { removeClient(client, true); }
}
export function closeAnonymousBoardClients(boardId: string): void {
  for (const client of [...(boards.get(boardId)?.values() ?? [])].filter((entry) => !entry.identity.userId)) closeClientWithRevocation(client);
}
export function closePublicBoardClients(boardId: string): void {
  for (const client of [...(boards.get(boardId)?.values() ?? [])].filter((entry) => entry.identity.role === 'public')) closeClientWithRevocation(client);
}
export function closeBoardConnections(boardId: string): void {
  for (const client of [...(boards.get(boardId)?.values() ?? [])]) closeClientWithRevocation(client);
}
export function closeUserConnections(userId: string, exceptSessionId?: string): void {
  for (const entries of boards.values()) for (const client of [...entries.values()]) {
    if (client.identity.userId === userId && (!exceptSessionId || client.identity.sessionId !== exceptSessionId)) closeClientWithRevocation(client);
  }
}
export function closeSessionConnections(sessionId: string): void {
  for (const entries of boards.values()) for (const client of [...entries.values()]) {
    if (client.identity.sessionId === sessionId) closeClientWithRevocation(client);
  }
}
export function addClient(response: Response): () => void {
  legacyClients.add(response);
  ensureHeartbeat();
  return () => { legacyClients.delete(response); };
}
export function connectedClients(boardId?: string): number {
  if (boardId) return boards.get(boardId)?.size ?? 0;
  return legacyClients.size + [...boards.values()].reduce((total, entries) => total + entries.size, 0);
}
