import type { Response } from 'express';

export type BoardEventName = 'task-created' | 'task-updated' | 'task-deleted';
export interface BoardEvent<T = unknown> { type: BoardEventName; mutationId: string | null; data: T; }
const clients = new Set<Response>();
let heartbeat: ReturnType<typeof setInterval> | undefined;

function write(client: Response, event: BoardEvent): void {
  client.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export function addClient(response: Response): () => void {
  clients.add(response);
  if (!heartbeat) heartbeat = setInterval(() => {
    for (const client of clients) client.write(': heartbeat\n\n');
  }, 25_000);
  return () => {
    clients.delete(response);
    if (clients.size === 0 && heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
  };
}

export function broadcast(event: BoardEvent): void {
  for (const client of clients) {
    try { write(client, event); } catch { clients.delete(client); }
  }
}

export function connectedClients(): number { return clients.size; }
