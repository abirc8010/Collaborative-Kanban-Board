import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

export type BoardEventName = 'task-created' | 'task-updated' | 'task-deleted';
export interface BoardEvent<T = unknown> { eventId?: string; type: BoardEventName; mutationId: string | null; data: T; }
const clients = new Set<Response>();
let heartbeat: ReturnType<typeof setInterval> | undefined;

function removeClient(response: Response): void {
  clients.delete(response);
  if (clients.size === 0 && heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
}

function write(client: Response, event: BoardEvent): void {
  client.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export function addClient(response: Response): () => void {
  clients.add(response);
  if (!heartbeat) heartbeat = setInterval(() => {
    for (const client of clients) {
      try { client.write(': heartbeat\n\n'); } catch { removeClient(client); }
    }
  }, 25_000);
  return () => removeClient(response);
}

export function broadcast(event: BoardEvent): void {
  const identified = { ...event, eventId: event.eventId ?? randomUUID() };
  for (const client of clients) {
    try { write(client, identified); } catch { removeClient(client); }
  }
}

export function connectedClients(): number { return clients.size; }
