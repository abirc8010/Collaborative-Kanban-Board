import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, parseBoardEvent } from '../services/api';
import { fromUrl, mergeBoardSnapshot, moveTask, normalize, ordered, pushUrl, writeUrl } from '../utils/board';
import { STATUSES, type BoardEvent, type Filters, type PresenceUser, type Status, type Task, type TaskDraft } from '../types';

interface PendingMutation { ids: Set<string>; before: Task[]; }
const mutationId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const relevantTasks = (event: BoardEvent): Task[] => event.data.affectedTasks ?? (event.data.task ? [event.data.task] : []);

export function useBoard(boardId: string, _csrfToken: string, canEdit: boolean, onAccessRevoked: () => void, onBoardChanged: () => void) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const [filters, setFilters] = useState<Filters>(() => fromUrl(window.location.search));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const pending = useRef(new Map<string, PendingMutation>());
  const buffers = useRef(new Map<string, BoardEvent[]>());
  const versions = useRef(new Map<string, number>());
  const tombstones = useRef(new Map<string, number>());
  const handledEventIds = useRef(new Set<string>());
  const ownMutationIds = useRef(new Set<string>());
  const searchHistoryTimer = useRef<number | null>(null);

  const rememberEvent = useCallback((event: BoardEvent) => {
    const key = event.eventId ?? event.mutationId;
    if (!key) return;
    handledEventIds.current.add(key);
    if (handledEventIds.current.size > 500) handledEventIds.current.delete(handledEventIds.current.values().next().value as string);
  }, []);

  const commit = useCallback((next: Task[] | ((current: Task[]) => Task[])) => {
    const resolved = typeof next === 'function' ? next(tasksRef.current) : next;
    tasksRef.current = normalize(resolved);
    setTasks(tasksRef.current);
  }, []);

  const syncBoard = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const requestedAt = Date.now();
    try {
      const result = await api.board(boardId);
      commit((current) => {
        const localIds = new Set([...pending.current.values()].flatMap((entry) => [...entry.ids]));
        const merged = mergeBoardSnapshot(current, result.tasks, localIds, tombstones.current, requestedAt);
        for (const id of merged.clearedTombstones) tombstones.current.delete(id);
        return merged.tasks;
      });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the board.'); }
    finally { setLoading(false); }
  }, [boardId, commit]);

  const applyEvent = useCallback((event: BoardEvent) => {
    const changed = relevantTasks(event);
    if (event.type === 'presence:snapshot') { setPresence(event.data.users ?? []); return; }
    if (event.type === 'presence:joined' && event.data.userId && event.data.username) {
      setPresence((current) => [...current.filter((person) => person.userId !== event.data.userId), { userId: event.data.userId!, username: event.data.username! }]);
      return;
    }
    if (event.type === 'presence:left' && event.data.userId) { setPresence((current) => current.filter((person) => person.userId !== event.data.userId)); return; }
    if (event.type === 'board:members-changed') { onBoardChanged(); return; }
    if (event.type === 'board:access-revoked') { setPresence([]); onAccessRevoked(); return; }
    if (event.type === 'presence:heartbeat') {
      const connectionId = event.data.connectionId;
      if (connectionId) void api.presenceHeartbeat(boardId, connectionId).catch(() => { setConnected(false); onAccessRevoked(); });
      return;
    }
    const deletedId = event.type === 'task-deleted' ? event.data.deletedId : undefined;
    const deletedAt = Date.parse(event.data.deletedAt ?? new Date().toISOString());
    if (!changed.length && !deletedId) return;
    commit((current) => {
      const byId = new Map(current.map((task) => [task.id, task]));
      if (deletedId) {
        const existing = byId.get(deletedId);
        if (!existing || Date.parse(existing.updatedAt) <= deletedAt) {
          tombstones.current.set(deletedId, Math.max(tombstones.current.get(deletedId) ?? 0, deletedAt));
          byId.delete(deletedId);
        }
      }
      for (const incoming of changed) {
        const deletedAtForTask = tombstones.current.get(incoming.id);
        if (deletedAtForTask !== undefined && Date.parse(incoming.updatedAt) <= deletedAtForTask) continue;
        if (deletedAtForTask !== undefined) tombstones.current.delete(incoming.id);
        const existing = byId.get(incoming.id);
        if (!existing || Date.parse(incoming.updatedAt) >= Date.parse(existing.updatedAt)) byId.set(incoming.id, incoming);
      }
      return [...byId.values()];
    });
  }, [boardId, commit, onAccessRevoked, onBoardChanged]);

  const dispatchRemoteEvent = useCallback((event: BoardEvent) => {
    const key = event.eventId ?? event.mutationId;
    if (key && handledEventIds.current.has(key)) return;
    if (event.mutationId && pending.current.has(event.mutationId)) {
      buffers.current.set(event.mutationId, [...(buffers.current.get(event.mutationId) ?? []), event]);
      return;
    }
    if (event.mutationId && ownMutationIds.current.has(event.mutationId)) {
      rememberEvent(event);
      return;
    }
    const impacted = relevantTasks(event).map((task) => task.id);
    if (event.data.deletedId) impacted.push(event.data.deletedId);
    const entries = [...pending.current.entries()].filter(([, mutation]) => impacted.some((taskId) => mutation.ids.has(taskId)));
    if (entries.length) {
      for (const [id] of entries) buffers.current.set(id, [...(buffers.current.get(id) ?? []), event]);
    } else {
      applyEvent(event);
      rememberEvent(event);
    }
  }, [applyEvent, rememberEvent]);

  useEffect(() => {
    void syncBoard(true);
    let opened = false;
    const connectionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const source = new EventSource(api.eventUrl(boardId, connectionId), { withCredentials: true });
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
    source.addEventListener('presence:snapshot', receive as EventListener);
    source.addEventListener('presence:joined', receive as EventListener);
    source.addEventListener('presence:left', receive as EventListener);
    source.addEventListener('presence:heartbeat', receive as EventListener);
    source.addEventListener('board:members-changed', receive as EventListener);
    source.addEventListener('board:access-revoked', () => { source.close(); setConnected(false); setPresence([]); onAccessRevoked(); });
    return () => { source.close(); setConnected(false); setPresence([]); };
  }, [boardId, dispatchRemoteEvent, onAccessRevoked, syncBoard]);

  useEffect(() => {
    const onPopState = () => {
      if (searchHistoryTimer.current !== null) window.clearTimeout(searchHistoryTimer.current);
      searchHistoryTimer.current = null;
      setFilters(fromUrl(window.location.search));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (searchHistoryTimer.current !== null) window.clearTimeout(searchHistoryTimer.current);
    };
  }, []);
  useEffect(() => { writeUrl(filters); }, [filters]);
  const changeFilters = useCallback((patch: Partial<Filters>) => setFilters((current) => {
    const next = { ...current, ...patch };
    if (Object.keys(patch).some((key) => key !== 'search')) {
      if (searchHistoryTimer.current !== null) window.clearTimeout(searchHistoryTimer.current);
      searchHistoryTimer.current = null;
      pushUrl(next);
    } else {
      const startSearchEntry = searchHistoryTimer.current === null;
      if (startSearchEntry) pushUrl(next);
      else writeUrl(next);
      if (searchHistoryTimer.current !== null) window.clearTimeout(searchHistoryTimer.current);
      searchHistoryTimer.current = window.setTimeout(() => { searchHistoryTimer.current = null; }, 650);
    }
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
      if (response && typeof response === 'object' && 'deletedId' in response && 'deletedAt' in response) {
        const deletion = response as { deletedId: string; deletedAt: string };
        tombstones.current.set(deletion.deletedId, Math.max(tombstones.current.get(deletion.deletedId) ?? 0, Date.parse(deletion.deletedAt)));
      }
      const queued = buffers.current.get(id) ?? [];
      ownMutationIds.current.add(id);
      if (ownMutationIds.current.size > 500) ownMutationIds.current.delete(ownMutationIds.current.values().next().value as string);
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
  }, [commit, dispatchRemoteEvent]);

  const create = useCallback(async (draft: TaskDraft) => {
    if (!canEdit) throw new Error('You have read-only access to this board.');
    const tempId = `local-${mutationId()}`;
    const optimisticTask: Task = { ...draft, boardId, id: tempId, position: tasksRef.current.filter((task) => task.status === draft.status).length, updatedAt: new Date().toISOString() };
    await runMutation([tempId], () => commit((current) => [...current, optimisticTask]), (id) => api.create(boardId, draft, id), ({ task }, currentIds) => { if (currentIds.has(tempId)) commit((current) => [...current.filter((item) => item.id !== tempId && item.id !== task.id), task]); }, 'Create task');
  }, [boardId, canEdit, commit, runMutation]);

  const update = useCallback(async (task: Task, patch: Partial<TaskDraft>) => {
    if (!canEdit) throw new Error('You have read-only access to this board.');
    const currentTask = tasksRef.current.find((item) => item.id === task.id) ?? task;
    const ids = patch.status && patch.status !== currentTask.status
      ? [...new Set([task.id, ...tasksRef.current.filter((item) => item.status === currentTask.status || item.status === patch.status).map((item) => item.id)])]
      : [task.id];
    await runMutation(ids, () => commit((current) => {
      const currentTask = current.find((item) => item.id === task.id);
      if (!currentTask) return current;
      const nextStatus = patch.status ?? currentTask.status;
      const moved = { ...currentTask, ...patch, status: nextStatus, updatedAt: new Date().toISOString() };
      if (nextStatus === currentTask.status) return current.map((item) => item.id === task.id ? moved : item);
      const nextPosition = current.filter((item) => item.status === nextStatus).length;
      return normalize([...current.filter((item) => item.id !== task.id), { ...moved, position: nextPosition }]);
    }), (id) => api.update(boardId, task.id, patch, id), ({ affectedTasks }, currentIds) => commit((current) => [...current.filter((item) => !affectedTasks.some((affected) => currentIds.has(affected.id) && affected.id === item.id)), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Update task');
  }, [boardId, canEdit, commit, runMutation]);

  const remove = useCallback(async (task: Task) => {
    if (!canEdit) throw new Error('You have read-only access to this board.');
    const currentTask = tasksRef.current.find((item) => item.id === task.id) ?? task;
    const ids = tasksRef.current.filter((item) => item.status === currentTask.status).map((item) => item.id);
    await runMutation(ids, () => commit((current) => current.filter((item) => item.id !== task.id)), (id) => api.remove(boardId, task.id, id), ({ affectedTasks }, currentIds) => commit((current) => [...current.filter((item) => item.id !== task.id && !(currentIds.has(item.id) && affectedTasks.some((affected) => affected.id === item.id))), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Delete task');
  }, [boardId, canEdit, commit, runMutation]);

  const move = useCallback(async (activeId: string, overId: string, targetStatus: Status) => {
    if (!canEdit) return;
    const change = moveTask(tasksRef.current, activeId, overId, targetStatus);
    if (!change) return;
    await runMutation(change.affectedIds, () => commit(change.tasks), (id) => api.update(boardId, activeId, { status: targetStatus, position: change.position }, id), ({ affectedTasks }, currentIds) => commit((board) => [...board.filter((task) => !affectedTasks.some((affected) => currentIds.has(affected.id) && affected.id === task.id)), ...affectedTasks.filter((affected) => currentIds.has(affected.id))]), 'Move task');
  }, [boardId, canEdit, commit, runMutation]);

  const visibleTasks = useMemo(() => ordered(tasks), [tasks]);
  return { tasks: visibleTasks, filters, changeFilters, loading, error, setError, notice, setNotice, connected, presence, refresh: () => syncBoard(), create, update, remove, move, statuses: STATUSES };
}
