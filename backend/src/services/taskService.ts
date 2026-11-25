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

async function getColumn(status: Status): Promise<TaskRecord[]> {
  const docs = await TaskModel.find({ status }).sort({ position: 1, _id: 1 }).exec();
  return docs.map((doc) => toTaskRecord(doc));
}

async function normalizeColumns(statuses: Status[], updatedAt = new Date()): Promise<TaskRecord[]> {
  const records: TaskRecord[] = [];
  for (const status of [...new Set(statuses)]) {
    const docs = await TaskModel.find({ status }).sort({ position: 1, _id: 1 }).exec();
    const writes = docs.map((doc, position) => ({ updateOne: { filter: { _id: doc._id }, update: { $set: { position, updatedAt } } } }));
    if (writes.length) await TaskModel.bulkWrite(writes);
    const canonical = await TaskModel.find({ status }).sort({ position: 1, _id: 1 }).exec();
    records.push(...canonical.map((doc) => toTaskRecord(doc)));
  }
  return records;
}

export async function listTasks(): Promise<TaskRecord[]> {
  const docs = await TaskModel.find().sort({ position: 1, _id: 1 }).exec();
  return docs.map((doc) => toTaskRecord(doc)).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.position - b.position);
}

export async function createTask(input: CreateTaskInput, mutationId?: string): Promise<TaskRecord> {
  return serialized(async () => {
    const position = await TaskModel.countDocuments({ status: input.status }).exec();
    const doc = await TaskModel.create({ ...input, position });
    const task = toTaskRecord(doc);
    broadcast({ type: 'task-created', mutationId: mutationId ?? null, data: { task } });
    return task;
  });
}

export async function updateTask(id: string, input: PatchTaskInput): Promise<{ task: TaskRecord; affectedTasks: TaskRecord[] }> {
  return serialized(async () => {
    if (!Types.ObjectId.isValid(id)) throw Object.assign(new Error('Task not found'), { status: 404 });
    const doc = await TaskModel.findById(id).exec();
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
      const target = await getColumn(newStatus);
      const remaining = target.filter((task) => task.id !== id);
      const insertAt = Math.max(0, Math.min(targetPosition ?? remaining.length, remaining.length));
      const orderedIds = remaining.map((task) => task.id);
      orderedIds.splice(insertAt, 0, id);
      doc.position = insertAt;
      await doc.save();
      const positionWrites = orderedIds.map((taskId, position) => ({
        updateOne: { filter: { _id: taskId }, update: { $set: { status: newStatus, position } } },
      }));
      if (positionWrites.length) await TaskModel.bulkWrite(positionWrites);
      const affectedTasks = await normalizeColumns([oldStatus, newStatus], new Date());
      const updated = await TaskModel.findById(id).exec();
      if (!updated) throw new Error('Updated task disappeared');
      const canonical = toTaskRecord(updated);
      broadcast({ type: 'task-updated', mutationId: input.mutationId ?? null, data: { task: canonical, affectedTasks } });
      return { task: canonical, affectedTasks };
    }
    await doc.save();
    const task = toTaskRecord(doc);
    broadcast({ type: 'task-updated', mutationId: input.mutationId ?? null, data: { task, affectedTasks: [task] } });
    return { task, affectedTasks: [task] };
  });
}

export async function deleteTask(id: string, mutationId?: string): Promise<{ deletedId: string; affectedTasks: TaskRecord[] }> {
  return serialized(async () => {
    if (!Types.ObjectId.isValid(id)) throw Object.assign(new Error('Task not found'), { status: 404 });
    const deleted = await TaskModel.findByIdAndDelete(id).exec();
    if (!deleted) throw Object.assign(new Error('Task not found'), { status: 404 });
    const status = deleted.status as Status;
    const deletedAt = new Date().toISOString();
    const affectedTasks = await normalizeColumns([status], new Date(deletedAt));
    const response = { deletedId: id, deletedAt, affectedTasks };
    broadcast({ type: 'task-deleted', mutationId: mutationId ?? null, data: response });
    return response;
  });
}

export async function seedIfEmpty(): Promise<void> {
  if (await TaskModel.exists({})) return;
  const examples = [
    { title: 'Map out the onboarding journey', description: 'Outline the key moments from first visit to activation.', priority: 'high', assignee: 'Abir', status: 'Backlog', position: 0 },
    { title: 'Audit the component library', description: 'Review spacing, states, and accessibility across shared UI.', priority: 'medium', assignee: 'Maya', status: 'Backlog', position: 1 },
    { title: 'Set up project analytics', description: 'Agree on the core events and dashboard metrics.', priority: 'low', assignee: 'Leo', status: 'Todo', position: 0 },
    { title: 'Design the new workspace', description: 'Create a calm, focused home for project updates.', priority: 'high', assignee: 'Maya', status: 'In Progress', position: 0 },
    { title: 'Document release checklist', description: 'A repeatable checklist for reliable launches.', priority: 'medium', assignee: 'Abir', status: 'Done', position: 0 },
  ];
  await TaskModel.insertMany(examples);
}
