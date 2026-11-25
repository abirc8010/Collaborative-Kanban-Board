import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardModel } from '../models/Board.js';
import type { UserRecord } from '../models/User.js';
import { loadBoardAccess, requireEditor, requireOwner } from '../middleware/boardAccess.js';
import { getBoardAccess, migrateLegacyBoardLinkAccess } from './boardService.js';

const boardId = '64b000000000000000000001';
const ownerId = 'owner-user';
const viewerId = 'invited-viewer';
const editorId = 'invited-editor';
const linkEditorId = 'link-editor-user';
const owner = { id: ownerId, username: 'owner', createdAt: '', updatedAt: '' } as UserRecord;
const viewer = { id: viewerId, username: 'viewer', createdAt: '', updatedAt: '' } as UserRecord;
const editor = { id: editorId, username: 'editor', createdAt: '', updatedAt: '' } as UserRecord;
const linkEditor = { id: linkEditorId, username: 'linker', createdAt: '', updatedAt: '' } as UserRecord;

function mockBoard(visibility: 'private' | 'public', enabled: boolean, role: 'viewer' | 'editor' = 'viewer') {
  const board = {
    _id: boardId,
    ownerId,
    visibility,
    linkAccess: { enabled, role },
    members: [
      { userId: viewerId, role: 'viewer' },
      { userId: editorId, role: 'editor' },
    ],
  };
  vi.spyOn(BoardModel, 'findById').mockReturnValue({ exec: vi.fn().mockResolvedValue(board) } as never);
}

afterEach(() => vi.restoreAllMocks());

describe('board access authorization', () => {
  it('lets anonymous visitors view link Viewer boards without edit access', async () => {
    mockBoard('public', true, 'viewer');
    const access = await getBoardAccess(boardId);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.source).toBe('link');
  });

  it('keeps pre-migration public boards link-accessible as Viewer only', async () => {
    const legacyBoard = { _id: boardId, ownerId, visibility: 'public', members: [] };
    vi.spyOn(BoardModel, 'findById').mockReturnValue({ exec: vi.fn().mockResolvedValue(legacyBoard) } as never);
    await expect(getBoardAccess(boardId)).resolves.toMatchObject({ role: 'public', linkAccess: { enabled: true, role: 'viewer' }, canEdit: false });
  });

  it('migrates only the linkAccess field and preserves legacy board data', async () => {
    const legacyBoard = { _id: boardId, visibility: 'public' };
    const cursor = { async *[Symbol.asyncIterator]() { yield legacyBoard; } };
    vi.spyOn(BoardModel, 'find').mockReturnValue({ cursor: () => cursor } as never);
    const update = vi.spyOn(BoardModel.collection, 'updateOne').mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null } as never);
    await migrateLegacyBoardLinkAccess();
    expect(update).toHaveBeenCalledWith(
      { _id: boardId, linkAccess: { $exists: false } },
      { $set: { linkAccess: { enabled: true, role: 'viewer' } } },
    );
  });

  it('lets anonymous visitors view link Editor boards but requires authentication for mutations', async () => {
    mockBoard('public', true, 'editor');
    const access = await getBoardAccess(boardId);
    expect(access.role).toBe('link-editor');
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    let status: number | undefined;
    requireEditor({ boardAccess: access } as never, {} as never, (error?: unknown) => { status = (error as { status?: number })?.status; });
    expect(status).toBe(401);
  });

  it('allows an authenticated link Editor to edit without an invitation', async () => {
    mockBoard('public', true, 'editor');
    const access = await getBoardAccess(boardId, linkEditor);
    expect(access.role).toBe('editor');
    expect(access.canEdit).toBe(true);
    expect(access.source).toBe('link');
  });

  it('denies edits to authenticated link Viewers', async () => {
    mockBoard('public', true, 'viewer');
    const access = await getBoardAccess(boardId, linkEditor);
    expect(access.canEdit).toBe(false);
    let status: number | undefined;
    requireEditor({ boardAccess: access, user: linkEditor } as never, {} as never, (error?: unknown) => { status = (error as { status?: number })?.status; });
    expect(status).toBe(403);
  });

  it('keeps Restricted boards unavailable to anonymous and uninvited users', async () => {
    mockBoard('private', false);
    await expect(getBoardAccess(boardId)).rejects.toMatchObject({ status: 404 });
    await expect(getBoardAccess(boardId, linkEditor)).rejects.toMatchObject({ status: 404 });
  });

  it('preserves invited Viewer, Editor, and owner permissions on Restricted boards', async () => {
    mockBoard('private', false);
    await expect(getBoardAccess(boardId, viewer)).resolves.toMatchObject({ role: 'viewer', canView: true, canEdit: false, canManage: false });
    vi.restoreAllMocks();
    mockBoard('private', false);
    await expect(getBoardAccess(boardId, editor)).resolves.toMatchObject({ role: 'editor', canView: true, canEdit: true, canManage: false });
    vi.restoreAllMocks();
    mockBoard('private', false);
    await expect(getBoardAccess(boardId, owner)).resolves.toMatchObject({ role: 'owner', canEdit: true, canManage: true });
  });

  it('reserves sharing and board-management operations for the owner', async () => {
    mockBoard('public', true, 'editor');
    const linkEditorAccess = await getBoardAccess(boardId, linkEditor);
    let status: number | undefined;
    requireOwner({ boardAccess: linkEditorAccess } as never, {} as never, (error?: unknown) => { status = (error as { status?: number })?.status; });
    expect(status).toBe(403);
    vi.restoreAllMocks();
    mockBoard('private', false);
    const ownerAccess = await getBoardAccess(boardId, owner);
    let ownerError: unknown;
    requireOwner({ boardAccess: ownerAccess } as never, {} as never, (error?: unknown) => { ownerError = error; });
    expect(ownerError).toBeUndefined();
  });

  it('requires an explicit board ID outside test mode', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let status: number | undefined;
    try {
      await loadBoardAccess({ params: {}, query: {}, body: {} } as never, {} as never, (error?: unknown) => { status = (error as { status?: number })?.status; });
    } finally { process.env.NODE_ENV = previous; }
    expect(status).toBe(400);
  });
});
