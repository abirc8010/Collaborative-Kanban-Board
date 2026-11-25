import { Schema, model } from 'mongoose';

export const STATUSES = ['Backlog', 'Todo', 'In Progress', 'Done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export interface TaskRecord {
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

const taskSchema = new Schema({
  boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: false, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  priority: { type: String, enum: PRIORITIES, required: true, default: 'medium' },
  assignee: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: STATUSES, required: true, default: 'Backlog' },
  position: { type: Number, required: true, min: 0 },
}, { timestamps: { createdAt: false, updatedAt: true }, versionKey: false });

taskSchema.index({ boardId: 1, status: 1, position: 1 });
export const TaskModel = model('Task', taskSchema);

export function toTaskRecord(doc: { _id: unknown; boardId?: unknown; title: string; description: string; priority: Priority; assignee: string; status: Status; position: number; updatedAt: Date }): TaskRecord {
  return { id: String(doc._id), boardId: String(doc.boardId ?? ''), title: doc.title, description: doc.description, priority: doc.priority, assignee: doc.assignee, status: doc.status, position: doc.position, updatedAt: doc.updatedAt.toISOString() };
}
