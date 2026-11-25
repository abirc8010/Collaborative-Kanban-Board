export const STATUSES = ['Backlog', 'Todo', 'In Progress', 'Done'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = 'low' | 'medium' | 'high';
export interface Task {
  id: string;
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
  type: 'task-created' | 'task-updated' | 'task-deleted';
  mutationId: string | null;
  data: { task?: Task; affectedTasks?: Task[]; deletedId?: string; deletedAt?: string };
}
