import mongoose, { Types } from 'mongoose';
import { BoardModel, type BoardRecord, type BoardRole, type Visibility } from '../models/Board.js';
import { TaskModel } from '../models/Task.js';
import { UserModel, type UserRecord } from '../models/User.js';
import { broadcastToBoard, closeBoardConnections, closeBoardMember, closePublicBoardClients, updateBoardMemberRole } from '../events/broadcaster.js';

export interface BoardAccess { boardId: string; role: BoardRole; canView: true; canEdit: boolean; canManage: boolean; ownerId: string; visibility: Visibility; }
function notFound(): never { throw Object.assign(new Error('Board not found or access denied.'), { status: 404 }); }
function objectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) notFound();
  return new Types.ObjectId(id);
}

export async function getBoardAccess(boardId: string, user?: UserRecord): Promise<BoardAccess> {
  const board = await BoardModel.findById(objectId(boardId)).exec();
  if (!board) notFound();
  const ownerId = String(board.ownerId);
  let role: BoardRole | undefined;
  if (user && ownerId === user.id) role = 'owner';
  else if (user) role = board.members.find((member) => String(member.userId) === user.id)?.role as BoardRole | undefined;
  if (!role && board.visibility === 'public') role = 'public';
  if (!role) notFound();
  return { boardId: String(board._id), role, canView: true, canEdit: role === 'owner' || role === 'editor', canManage: role === 'owner', ownerId, visibility: board.visibility };
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
      visibility: board.visibility as Visibility,
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
  if (currentUserId && record.ownerId !== currentUserId) record.role = board.members.find((member) => String(member.userId) === currentUserId)?.role ?? 'public';
  else if (!currentUserId) record.role = 'public';
  if (record.role === 'public') record.members = [];
  return record;
}

export async function createBoard(ownerId: string, name: string, visibility: Visibility): Promise<BoardRecord> {
  const board = await BoardModel.create({ name, ownerId, visibility, members: [] });
  const record = await getBoard(String(board._id), ownerId);
  return record;
}

export async function updateBoard(boardId: string, patch: { name?: string; visibility?: Visibility }): Promise<BoardRecord> {
  const board = await BoardModel.findByIdAndUpdate(objectId(boardId), { $set: patch }, { new: true, runValidators: true }).exec();
  if (!board) notFound();
  if (patch.visibility === 'private') closePublicBoardClients(boardId);
  broadcastToBoard(boardId, 'board:members-changed', { boardId, visibility: board.visibility });
  return getBoard(boardId, String(board.ownerId));
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
