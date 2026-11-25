import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, parseBoardEvent } from '../services/api';
import { fromUrl, normalize, ordered, pushUrl, writeUrl } from '../utils/board';
import { STATUSES, type BoardEvent, type Filters, type Status, type Task, type TaskDraft } from '../types';

interface PendingMutation { ids: Set<string>; before: Task[]; }
const mutationId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const relevantTasks = (event: BoardEvent): Task[] => event.data.affectedTasks ?? (event.data.task ? [event.data.task] : []);

export function useBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const [filters, setFilters] = useState<Filters>(() => fromUrl(window.location.search));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const pending = useRef(new Map<string, PendingMutation>());
  const buffers = useRef(new Map<string, BoardEvent[]>());
  const versions = useRef(new Map<string, number>());

  const commit = useCallback((next: Task[] | ((current: Task[]) => Task[])) => {
    const resolved = typeof next === 'function' ? next(tasksRef.current) : next;
    tasksRef.current = normalize(resolved);
    setTasks(tasksRef.current);
  }, []);

  const syncBoard = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const result = await api.board();
      commit((current) => {
        const localIds = new Set([...pending.current.values()].flatMap((entry) => [...entry.ids]));
        const remoteById = new Map(result.tasks.map((task) => [task.id, task]));
        const preserved = current.filter((task) => localIds.has(task.id));
        for (const task of preserved) remoteById.delete(task.id);
        return [...remoteById.values(), ...preserved];
      });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the board.'); }
    finally { setLoading(false); }
  }, [commit]);

  const applyEvent = useCallback((event: BoardEvent) => {
    const changed = relevantTasks(event);
    if (event.type === 'task-deleted' && event.data.deletedId) {
      commit((current) => current.filter((task) => task.id !== event.data.deletedId));
      return;
    }
    if (!changed.length) return;
    commit((current) => {
      const byId = new Map(current.map((task) => [task.id, task]));
      for (const incoming of changed) {
        const existing = byId.get(incoming.id);
        if (!existing || Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)) byId.set(incoming.id, incoming);
      }
      return [...byId.values()];
    });
  }, [commit]);

  const dispatchRemoteEvent = useCallback((event: BoardEvent) => {
    if (event.mutationId && pending.current.has(event.mutationId)) return;
    const impacted = relevantTasks(event).map((task) => task.id);
    if (event.data.deletedId) impacted.push(event.data.deletedId);
    const entries = [...pending.current.entries()].filter(([, mutation]) => impacted.some((taskId) => mutation.ids.has(taskId)));
    if (entries.length) {
      for (const [id] of entries) buffers.current.set(id, [...(buffers.current.get(id) ?? []), event]);
    } else applyEvent(event);
  }, [applyEvent]);

  useEffect(() => {
    void syncBoard(true);
    let opened = false;
    const source = new EventSource(api.eventUrl());
    source.onopen = () => {
      setConnected(true);
      if (opened) void syncBoard();
      opened = true;
    };
    source.onerror = () => setConnected(false);
    const receive = (message: MessageEvent<string>) => {
      try {
        dispatchRemoteEvent(parseBoardEvent(message));
      } catch { setNotice('A live update could not be read. The board will resynchronize on reconnect.'); }
    };
    source.addEventListener('task-created', receive as EventListener);
    source.addEventListener('task-updated', receive as EventListener);
    source.addEventListener('task-deleted', receive as EventListener);
    return () => source.close();
  }, [dispatchRemoteEvent, syncBoard]);

  useEffect(() => {
    const onPopState = () => setFilters(fromUrl(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => { writeUrl(filters); }, [filters]);
  const changeFilters = useCallback((patch: Partial<Filters>) => setFilters((current) => {
    const next = { ...current, ...patch };
    if (Object.keys(patch).some((key) => key !== 'search')) pushUrl(next);
    return next;
  }), []);

  const runMutation = useCallback(async <T,>(ids: string[], optimistic: () => void, request: (id: string) => Promise<T>, reconcile: (response: T, currentIds: Set<string>) => void, label: string) => {
    const id = mutationId();
    const mutationVersions = new Map<string, number>();
    for (const taskId of ids) {
      const version = (versions.current.get(taskId) ?? 0) + 1;
      versions.current.set(taskId, version);
      mutationVersions.set(taskId, version);
    }
    const entry: PendingMutation = { ids: new Set(ids), before: tasksRef.current.filter((task) => ids.includes(task.id)) };
    pending.current.set(id, entry);
    buffers.current.set(id, []);
    optimistic();
    setNotice('');
    try {
      const response = await request(id);
      setError('');
      const currentIds = new Set(ids.filter((taskId) => versions.current.get(taskId) === mutationVersions.get(taskId)));
      reconcile(response, currentIds);
      const queued = buffers.current.get(id) ?? [];
      pending.current.delete(id);
      buffers.current.delete(id);
      for (const event of queued) dispatchRemoteEvent(event);
      return response;
    } catch (reason) {
      const current = tasksRef.current;
      const rollbackIds = new Set(ids.filter((taskId) => versions.current.get(taskId) === mutationVersions.get(taskId)));
      commit([...current.filter((task) => !rollbackIds.has(task.id)), ...entry.before.filter((task) => rollbackIds.has(task.id))]);
      const queued = buffers.current.get(id) ?? [];
      pending.current.delete(id);
      buffers.current.delete(id);
      for (const event of queued) dispatchRemoteEvent(event);
      setNotice(reason instanceof Error ? reason.message : `${label} failed. Your previous board state was restored.`);
      throw reason;
    }
  }, [applyEvent, commit, dispatchRemoteEvent]);

  const create = useCallback(async (draft: TaskDraft) => {
    const tempId = `local-${mutationId()}`;
    const optimisticTask: Task = { ...draft, id: tempId, position: tasksRef.current.filter((task) => task.status === draft.status).length, updatedAt: new Date().toISOString() };
    await runMutation([tempId], () => commit((current) => [...current, optimisticTask]), (id) => api.create(draft, id), ({ task }, currentIds) => { if (currentIds.has(tempId)) commit((current) => [...current.filter((item) => item.id !== tempId && item.id !== task.id), task]); }, 'Create task');
  }, [commit, runMutation]);

  const update = useCallback(async (task: Task, patch: Partial<TaskDraft>) => {
    const currentTask = tasksRef.current.find((item) => item.id === task.id) ?? task;
    const priorColumn = tasksRef.current.filter((item) => item.status === currentTask.status).map((item) => item.id);
    const nextStatus = patch.status ?? currentTask.status;
    const ids = [...new Set([task.id, ...priorColumn, ...tasksRef.current.filter((item) => item.status === nextStatus).map((item) => item.id)])];
    await runMutation(ids, () => commit((current) => current.map((item) => item.id === task.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)), (id) => api.update(task.id, patch, id), ({ affectedTasks }, currentIds) => commit((current) => [...current.filter((item) => !affectedTasks.some((affected) => currentIds.has(affected.id) && affected.id === item.id)), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Update task');
  }, [commit, runMutation]);

  const remove = useCallback(async (task: Task) => {
    const ids = tasksRef.current.filter((item) => item.status === task.status).map((item) => item.id);
    await runMutation(ids, () => commit((current) => current.filter((item) => item.id !== task.id)), (id) => api.remove(task.id, id), ({ affectedTasks }, currentIds) => commit((current) => [...current.filter((item) => item.id !== task.id && !(currentIds.has(item.id) && affectedTasks.some((affected) => affected.id === item.id))), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Delete task');
  }, [commit, runMutation]);

  const move = useCallback(async (activeId: string, overId: string, targetStatus: Status) => {
    const current = ordered(tasksRef.current);
    const source = current.find((task) => task.id === activeId);
    if (!source) return;
    const from = current.filter((task) => task.status === source.status);
    const to = targetStatus === source.status ? from : current.filter((task) => task.status === targetStatus);
    const oldIndex = from.findIndex((task) => task.id === activeId);
    let newIndex = overId.startsWith('column:') ? to.length : to.findIndex((task) => task.id === overId);
    if (newIndex < 0) newIndex = to.length;
    if (source.status === targetStatus && oldIndex === newIndex) return;
    const moved = { ...source, status: targetStatus, position: newIndex, updatedAt: new Date().toISOString() };
    const next = current.filter((task) => task.id !== activeId);
    const dest = next.filter((task) => task.status === targetStatus);
    dest.splice(Math.min(newIndex, dest.length), 0, moved);
    const normalized = normalize([...next.filter((task) => task.status !== targetStatus), ...dest]);
    const ids = [...new Set([...from.map((task) => task.id), ...to.map((task) => task.id)])];
    await runMutation(ids, () => commit(normalized), (id) => api.update(activeId, { status: targetStatus, position: newIndex }, id), ({ affectedTasks }, currentIds) => commit((board) => [...board.filter((task) => !affectedTasks.some((affected) => currentIds.has(affected.id) && affected.id === task.id)), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Move task');
  }, [commit, runMutation]);

  const visibleTasks = useMemo(() => ordered(tasks), [tasks]);
  return { tasks: visibleTasks, filters, changeFilters, loading, error, setError, notice, setNotice, connected, refresh: () => syncBoard(), create, update, remove, move, statuses: STATUSES };
}
