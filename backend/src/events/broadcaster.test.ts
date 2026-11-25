import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { addClient, broadcast, connectedClients } from './broadcaster.js';

const disconnect: Array<() => void> = [];
afterEach(() => {
  for (const close of disconnect.splice(0)) close();
});

describe('SSE broadcaster', () => {
  it('sends named events with IDs and removes closed clients', () => {
    const response = new PassThrough();
    response.setEncoding('utf8');
    disconnect.push(addClient(response as unknown as Response));
    expect(connectedClients()).toBe(1);

    broadcast({ type: 'task-updated', mutationId: 'local-123', data: { task: { id: 'task-1' } } });
    const payload = response.read() as string;
    expect(payload).toContain('id: ');
    expect(payload).toContain('event: task-updated');
    expect(payload).toContain('"mutationId":"local-123"');

    disconnect.pop()?.();
    expect(connectedClients()).toBe(0);
    response.destroy();
  });
});
