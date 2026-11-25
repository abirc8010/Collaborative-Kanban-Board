export const STATUSES = ['Backlog', 'Todo', 'In Progress', 'Done'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = 'low' | 'medium' | 'high';
export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status;
  position: number;
  updatedAt: string;
}
export interface TaskDraft {
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: Status;
}
export interface Filters { search: string; priority: Priority | 'all'; assignee: string | 'all'; }
export interface BoardEvent {
  eventId?: string;
  type: 'task-created' | 'task-updated' | 'task-deleted' | 'board:members-changed' | 'presence:snapshot' | 'presence:joined' | 'presence:left' | 'presence:heartbeat' | 'board:access-revoked';
  mutationId: string | null;
  data: { boardId?: string; task?: Task; affectedTasks?: Task[]; deletedId?: string; deletedAt?: string; users?: PresenceUser[]; userId?: string; username?: string; action?: string; role?: BoardRole; connectionId?: string };
}
export type BoardRole = 'owner' | 'editor' | 'viewer' | 'public';
export type Visibility = 'public' | 'private';
export interface BoardMember { userId: string; username: string; role: 'viewer' | 'editor'; createdAt: string; }
export interface Board { id: string; name: string; ownerId: string; ownerUsername: string; visibility: Visibility; role: BoardRole; members: BoardMember[]; memberCount: number; createdAt: string; updatedAt: string; }
export interface User { id: string; username: string; createdAt: string; updatedAt: string; }
export interface PresenceUser { userId: string; username: string; }
