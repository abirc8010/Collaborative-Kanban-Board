import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { addClient, broadcast, broadcastToBoard, connectedClients, connectBoardClient } from './broadcaster.js';

const disconnect: Array<() => void> = [];
afterEach(() => {
  for (const close of disconnect.splice(0)) close();
});

describe('SSE broadcaster', () => {
  it('does not send authenticated presence snapshots to public visitors', () => {
    const response = new PassThrough();
    response.setEncoding('utf8');
    disconnect.push(connectBoardClient(response as unknown as Response, 'public-board', { connectionId: '11111111-1111-4111-8111-111111111111', userId: null, username: null, role: 'public', sessionId: null, expiresAt: null }));
    const payload = response.read() as string | null;
    expect(payload ?? '').not.toContain('presence:snapshot');
    expect(payload ?? '').not.toContain('presence:joined');
  });

  it('does not expose invited-member or presence events to link Editors', () => {
    const response = new PassThrough();
    response.setEncoding('utf8');
    disconnect.push(connectBoardClient(response as unknown as Response, 'link-editor-board', { connectionId: '22222222-2222-4222-8222-222222222222', userId: null, username: null, role: 'link-editor', source: 'link', sessionId: null, expiresAt: null }));
    response.read();
    broadcastToBoard('link-editor-board', 'board:members-changed', { userId: 'private-member' });
    broadcastToBoard('link-editor-board', 'presence:joined', { userId: 'private-member', username: 'secret' });
    expect(response.read()).toBeNull();
  });

  it('sends named events with IDs and removes closed clients', () => {
    const response = new PassThrough();
    response.setEncoding('utf8');
    disconnect.push(addClient(response as unknown as Response));
    expect(connectedClients()).toBe(1);

    broadcast({ boardId: 'legacy-test', type: 'task-updated', mutationId: 'local-123', data: { task: { id: 'task-1' } } });
    const payload = response.read() as string;
    expect(payload).toContain('id: ');
    expect(payload).toContain('event: task-updated');
    expect(payload).toContain('"mutationId":"local-123"');

    disconnect.pop()?.();
    expect(connectedClients()).toBe(0);
    response.destroy();
  });
});
