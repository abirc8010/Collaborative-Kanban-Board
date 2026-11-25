import type { Filters, Task, Status } from '../types';

export function ordered(tasks: Task[]): Task[] {
  const statusOrder = new Map<Status, number>([['Backlog', 0], ['Todo', 1], ['In Progress', 2], ['Done', 3]]);
  return [...tasks].sort((a, b) => (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99) || a.position - b.position || a.id.localeCompare(b.id));
}
export function normalize(tasks: Task[]): Task[] {
  const positions = new Map<string, number>();
  const grouped = new Map<Status, Task[]>();
  for (const task of tasks) grouped.set(task.status, [...(grouped.get(task.status) ?? []), task]);
  for (const group of grouped.values()) group.sort((a, b) => a.position - b.position).forEach((task, index) => positions.set(task.id, index));
  return tasks.map((task) => ({ ...task, position: positions.get(task.id) ?? task.position }));
}

export function mergeBoardSnapshot(current: Task[], incoming: Task[], pendingIds: ReadonlySet<string>, tombstones: ReadonlyMap<string, number>, requestedAt: number): { tasks: Task[]; clearedTombstones: string[] } {
  const remoteById = new Map(incoming.map((task) => [task.id, task]));
  const merged = new Map<string, Task>();
  const clearedTombstones: string[] = [];
  for (const remote of remoteById.values()) {
    const deletedAt = tombstones.get(remote.id);
    if (deletedAt !== undefined && Date.parse(remote.updatedAt) <= deletedAt) continue;
    if (deletedAt !== undefined) clearedTombstones.push(remote.id);
    const existing = current.find((task) => task.id === remote.id);
    merged.set(remote.id, existing && Date.parse(existing.updatedAt) > Date.parse(remote.updatedAt) ? existing : remote);
  }
  for (const existing of current) {
    if (pendingIds.has(existing.id)) merged.set(existing.id, existing);
    else if (!remoteById.has(existing.id) && Date.parse(existing.updatedAt) >= requestedAt && !tombstones.has(existing.id)) merged.set(existing.id, existing);
  }
  return { tasks: [...merged.values()], clearedTombstones };
}

export function moveTask(tasks: Task[], activeId: string, overId: string, targetStatus: Status): { tasks: Task[]; position: number; affectedIds: string[] } | null {
  const current = ordered(tasks);
  const source = current.find((task) => task.id === activeId);
  if (!source) return null;
  const from = current.filter((task) => task.status === source.status);
  const to = targetStatus === source.status ? from : current.filter((task) => task.status === targetStatus);
  const oldIndex = from.findIndex((task) => task.id === activeId);
  let position = overId.startsWith('column:') ? to.length : to.findIndex((task) => task.id === overId);
  if (position < 0) position = to.length;
  if (source.status === targetStatus && oldIndex === position) return null;
  const moved = { ...source, status: targetStatus, position, updatedAt: new Date().toISOString() };
  const remaining = current.filter((task) => task.id !== activeId);
  const destination = remaining.filter((task) => task.status === targetStatus);
  destination.splice(Math.min(position, destination.length), 0, moved);
  const next = normalize([...remaining.filter((task) => task.status !== targetStatus), ...destination]);
  return { tasks: next, position, affectedIds: [...new Set([...from, ...to].map((task) => task.id))] };
}

export function filterTasks(tasks: Task[], filters: Filters): Task[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return ordered(tasks).filter((task) => (!search || task.title.toLocaleLowerCase().includes(search)) && (filters.priority === 'all' || task.priority === filters.priority) && (filters.assignee === 'all' || task.assignee === filters.assignee));
}
export function fromUrl(search: string): Filters {
  const params = new URLSearchParams(search);
  const priority = params.get('priority');
  return { search: params.get('search') ?? '', priority: priority === 'low' || priority === 'medium' || priority === 'high' ? priority : 'all', assignee: params.get('assignee') || 'all' };
}
export function writeUrl(filters: Filters): void {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters.assignee !== 'all') params.set('assignee', filters.assignee);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

export function pushUrl(filters: Filters): void {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters.assignee !== 'all') params.set('assignee', filters.assignee);
  const query = params.toString();
  window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}
