import mongoose, { Types } from 'mongoose';
import { BoardModel, type BoardRecord, type BoardRole, type LinkAccess, type Visibility } from '../models/Board.js';
import { TaskModel } from '../models/Task.js';
import { UserModel, type UserRecord } from '../models/User.js';
import { broadcastToBoard, closeBoardConnections, closeBoardMember, closeLinkAccessClients, updateBoardMemberRole } from '../events/broadcaster.js';

export interface BoardAccess { boardId: string; role: BoardRole; canView: true; canEdit: boolean; canManage: boolean; ownerId: string; visibility: Visibility; linkAccess: LinkAccess; source: 'owner' | 'member' | 'link'; }
function notFound(): never { throw Object.assign(new Error('Board not found or access denied.'), { status: 404 }); }
function objectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) notFound();
  return new Types.ObjectId(id);
}

export async function getBoardAccess(boardId: string, user?: UserRecord): Promise<BoardAccess> {
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  const ownerId = String(board.ownerId);
  const legacyPublic = board.visibility === 'public' && !board.linkAccess;
  const linkAccess: LinkAccess = board.linkAccess?.enabled
    ? { enabled: true, role: board.linkAccess.role }
    : legacyPublic ? { enabled: true, role: 'viewer' } : { enabled: false, role: 'viewer' };
  let role: BoardRole | undefined;
  let source: BoardAccess['source'] = 'link';
  if (user && ownerId === user.id) { role = 'owner'; source = 'owner'; }
  else if (user) {
    const memberRole = board.members.find((member) => String(member.userId) === user.id)?.role as BoardRole | undefined;
    if (memberRole) { role = memberRole; source = 'member'; }
  }
  if (!role && linkAccess.enabled) role = user ? linkAccess.role : (linkAccess.role === 'editor' ? 'link-editor' : 'public');
  if (!role) notFound();
  return { boardId: String(board._id), role, canView: true, canEdit: role === 'owner' || role === 'editor', canManage: role === 'owner', ownerId, visibility: linkAccess.enabled ? 'public' : 'private', linkAccess, source };
}

async function records(boards: Array<InstanceType<typeof BoardModel>>): Promise<BoardRecord[]> {
  const userIds = new Set<string>();
  for (const board of boards) {
    userIds.add(String(board.ownerId));
    for (const member of board.members) userIds.add(String(member.userId));
  }
  const users = await UserModel.find({ _id: { $in: [...userIds] } }).exec();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return boards.map((board) => {
    const owner = byId.get(String(board.ownerId));
    return {
      id: String(board._id), name: board.name, ownerId: String(board.ownerId), ownerUsername: owner?.username ?? 'Unknown',
      visibility: (board.linkAccess?.enabled ?? board.visibility === 'public') ? 'public' : 'private',
      linkAccess: board.linkAccess ? { enabled: board.linkAccess.enabled, role: board.linkAccess.role as 'viewer' | 'editor' } : { enabled: board.visibility === 'public', role: 'viewer' },
      role: 'owner',
      members: board.members.map((member) => ({ userId: String(member.userId), username: byId.get(String(member.userId))?.username ?? 'Unknown', role: member.role as 'viewer' | 'editor', createdAt: member.createdAt.toISOString() })),
      memberCount: board.members.length + 1,
      createdAt: board.createdAt.toISOString(), updatedAt: board.updatedAt.toISOString(),
    };
  });
}

export async function listUserBoards(userId: string): Promise<BoardRecord[]> {
  const boards = await BoardModel.find({ $or: [{ ownerId: userId }, { 'members.userId': userId }] }).sort({ updatedAt: -1 }).exec();
  const output = await records(boards);
  return output.map((record) => ({ ...record, role: record.ownerId === userId ? 'owner' : (boards.find((board) => String(board._id) === record.id)?.members.find((member) => String(member.userId) === userId)?.role ?? 'viewer') }));
}

export async function getBoard(boardId: string, currentUserId?: string): Promise<BoardRecord> {
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  const list = await records([board]);
  const record = list[0];
  if (!record) notFound();
  const isOwner = currentUserId === record.ownerId;
  const member = currentUserId ? board.members.find((entry) => String(entry.userId) === currentUserId) : undefined;
  if (!isOwner) record.role = member?.role ?? (record.linkAccess.enabled ? (currentUserId ? record.linkAccess.role : record.linkAccess.role === 'editor' ? 'link-editor' : 'public') : 'public');
  if (!isOwner && !member) record.members = [];
  return record;
}

export async function createBoard(ownerId: string, name: string, visibility: Visibility): Promise<BoardRecord> {
  const board = await BoardModel.create({ name, ownerId, visibility, linkAccess: { enabled: visibility === 'public', role: 'viewer' }, members: [] });
  const record = await getBoard(String(board._id), ownerId);
  return record;
}

export async function updateBoard(boardId: string, patch: { name?: string; visibility?: Visibility; linkAccess?: LinkAccess }): Promise<BoardRecord> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.linkAccess) {
    update.linkAccess = patch.linkAccess;
    update.visibility = patch.linkAccess.enabled ? 'public' : 'private';
  } else if (patch.visibility) {
    update.visibility = patch.visibility;
    update.linkAccess = { enabled: patch.visibility === 'public', role: 'viewer' };
  }
  const board = await BoardModel.findByIdAndUpdate(objectId(boardId), { $set: update }, { new: true, runValidators: true }).exec();
  if (!board) notFound();
  if (patch.visibility || patch.linkAccess) closeLinkAccessClients(boardId);
  broadcastToBoard(boardId, 'board:members-changed', { boardId, visibility: board.visibility });
  return getBoard(boardId, String(board.ownerId));
}

export async function migrateLegacyBoardLinkAccess(): Promise<void> {
  const legacyBoards = BoardModel.find({ linkAccess: { $exists: false } }).cursor();
  for await (const board of legacyBoards) {
    await BoardModel.collection.updateOne(
      { _id: board._id, linkAccess: { $exists: false } },
      { $set: { linkAccess: { enabled: board.visibility === 'public', role: 'viewer' } } },
    );
  }
}

export async function deleteBoard(boardId: string): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const board = await BoardModel.findById(objectId(boardId)).session(session).exec();
      if (!board) notFound();
      await TaskModel.deleteMany({ boardId: board._id }).session(session).exec();
      await BoardModel.deleteOne({ _id: board._id }).session(session).exec();
    });
  } finally { await session.endSession(); }
  closeBoardConnections(boardId);
}

export async function addBoardMember(boardId: string, username: string, role: 'viewer' | 'editor', currentUserId: string): Promise<BoardRecord> {
  const user = await UserModel.findOne({ normalizedUsername: username.trim().toLocaleLowerCase('en-US') }).exec();
  if (!user) throw Object.assign(new Error('No account was found with that username.'), { status: 404 });
  if (String(user._id) === currentUserId) throw Object.assign(new Error('You already own this board.'), { status: 400 });
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  const existing = board.members.find((member) => String(member.userId) === String(user._id));
  if (existing) throw Object.assign(new Error('This user already has access to the board.'), { status: 409 });
  board.members.push({ userId: user._id, role, createdAt: new Date() });
  await board.save();
  broadcastToBoard(boardId, 'board:members-changed', { boardId, action: 'added', userId: String(user._id), username: user.username, role });
  return getBoard(boardId, currentUserId);
}

export async function updateBoardMember(boardId: string, memberId: string, role: 'viewer' | 'editor', currentUserId: string): Promise<BoardRecord> {
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  if (String(board.ownerId) === memberId || memberId === currentUserId) throw Object.assign(new Error('The board owner permission cannot be changed.'), { status: 400 });
  const member = board.members.find((entry) => String(entry.userId) === memberId);
  if (!member) notFound();
  member.role = role;
  await board.save();
  updateBoardMemberRole(boardId, memberId, role);
  broadcastToBoard(boardId, 'board:members-changed', { boardId, action: 'updated', userId: memberId, role });
  return getBoard(boardId, currentUserId);
}

export async function removeBoardMember(boardId: string, memberId: string, currentUserId: string): Promise<BoardRecord> {
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  if (String(board.ownerId) === memberId || memberId === currentUserId) throw Object.assign(new Error('The board owner cannot be removed.'), { status: 400 });
  const member = board.members.find((entry) => String(entry.userId) === memberId);
  if (!member) notFound();
  board.members.pull({ userId: memberId });
  await board.save();
  closeBoardMember(boardId, memberId);
  broadcastToBoard(boardId, 'board:members-changed', { boardId, action: 'removed', userId: memberId });
  return getBoard(boardId, currentUserId);
}
