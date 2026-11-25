import { Types } from 'mongoose';
import { STATUSES, TaskModel, toTaskRecord, type Status, type TaskRecord } from '../models/Task.js';
import type { CreateTaskInput, PatchTaskInput } from '../validation/taskSchemas.js';
import { broadcast } from '../events/broadcaster.js';

let mutationQueue: Promise<void> = Promise.resolve();
async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = mutationQueue;
  mutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
}

async function getColumn(boardId: string, status: Status): Promise<TaskRecord[]> {
  const docs = await TaskModel.find({ boardId, status }).sort({ position: 1, _id: 1 }).exec();
  return docs.map((doc) => toTaskRecord(doc));
}

async function normalizeColumns(boardId: string, statuses: Status[], updatedAt = new Date()): Promise<TaskRecord[]> {
  const records: TaskRecord[] = [];
  for (const status of [...new Set(statuses)]) {
    const docs = await TaskModel.find({ boardId, status }).sort({ position: 1, _id: 1 }).exec();
    const writes = docs.map((doc, position) => ({ updateOne: { filter: { _id: doc._id }, update: { $set: { position, updatedAt } } } }));
    if (writes.length) await TaskModel.bulkWrite(writes);
    const canonical = await TaskModel.find({ boardId, status }).sort({ position: 1, _id: 1 }).exec();
    records.push(...canonical.map((doc) => toTaskRecord(doc)));
  }
  return records;
}

export async function listTasks(boardId: string): Promise<TaskRecord[]> {
  const docs = await TaskModel.find({ boardId }).sort({ position: 1, _id: 1 }).exec();
  return docs.map((doc) => toTaskRecord(doc)).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.position - b.position);
}

export async function createTask(boardId: string, input: CreateTaskInput, mutationId?: string): Promise<TaskRecord> {
  return serialized(async () => {
    const position = await TaskModel.countDocuments({ boardId, status: input.status }).exec();
    const doc = await TaskModel.create({ ...input, boardId, position });
    const task = toTaskRecord(doc);
    broadcast({ boardId, type: 'task-created', mutationId: mutationId ?? null, data: { boardId, task } });
    return task;
  });
}

export async function updateTask(boardId: string, id: string, input: PatchTaskInput): Promise<{ task: TaskRecord; affectedTasks: TaskRecord[] }> {
  return serialized(async () => {
    if (!Types.ObjectId.isValid(id)) throw Object.assign(new Error('Task not found'), { status: 404 });
    const doc = await TaskModel.findOne({ _id: id, boardId }).exec();
    if (!doc) throw Object.assign(new Error('Task not found'), { status: 404 });
    const oldStatus = doc.status as Status;
    const newStatus = input.status ?? oldStatus;
    const targetPosition = input.position;
    const fields = { ...input };
    delete fields.mutationId;
    delete fields.position;
    Object.assign(doc, fields);
    doc.status = newStatus;
    if (oldStatus !== newStatus || targetPosition !== undefined) {
      const target = await getColumn(boardId, newStatus);
      const remaining = target.filter((task) => task.id !== id);
      const insertAt = Math.max(0, Math.min(targetPosition ?? remaining.length, remaining.length));
      const orderedIds = remaining.map((task) => task.id);
      orderedIds.splice(insertAt, 0, id);
      doc.position = insertAt;
      await doc.save();
      const positionWrites = orderedIds.map((taskId, position) => ({
        updateOne: { filter: { _id: taskId, boardId }, update: { $set: { status: newStatus, position } } },
      }));
      if (positionWrites.length) await TaskModel.bulkWrite(positionWrites);
      const affectedTasks = await normalizeColumns(boardId, [oldStatus, newStatus], new Date());
      const updated = await TaskModel.findOne({ _id: id, boardId }).exec();
      if (!updated) throw new Error('Updated task disappeared');
      const canonical = toTaskRecord(updated);
      broadcast({ boardId, type: 'task-updated', mutationId: input.mutationId ?? null, data: { boardId, task: canonical, affectedTasks } });
      return { task: canonical, affectedTasks };
    }
    await doc.save();
    const task = toTaskRecord(doc);
    broadcast({ boardId, type: 'task-updated', mutationId: input.mutationId ?? null, data: { boardId, task, affectedTasks: [task] } });
    return { task, affectedTasks: [task] };
  });
}

export async function deleteTask(boardId: string, id: string, mutationId?: string): Promise<{ deletedId: string; deletedAt: string; affectedTasks: TaskRecord[] }> {
  return serialized(async () => {
    if (!Types.ObjectId.isValid(id)) throw Object.assign(new Error('Task not found'), { status: 404 });
    const deleted = await TaskModel.findOneAndDelete({ _id: id, boardId }).exec();
    if (!deleted) throw Object.assign(new Error('Task not found'), { status: 404 });
    const status = deleted.status as Status;
    const deletedAt = new Date().toISOString();
    const affectedTasks = await normalizeColumns(boardId, [status], new Date(deletedAt));
    const response = { deletedId: id, deletedAt, affectedTasks };
    broadcast({ boardId, type: 'task-deleted', mutationId: mutationId ?? null, data: { boardId, ...response } });
    return response;
  });
}

