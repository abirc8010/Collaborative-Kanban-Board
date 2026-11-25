import type { Filters, Task, Status } from '../types';

export function ordered(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.status.localeCompare(b.status) || a.position - b.position || a.id.localeCompare(b.id));
}
export function normalize(tasks: Task[]): Task[] {
  const positions = new Map<string, number>();
  const grouped = new Map<Status, Task[]>();
  for (const task of tasks) grouped.set(task.status, [...(grouped.get(task.status) ?? []), task]);
  for (const group of grouped.values()) group.sort((a, b) => a.position - b.position).forEach((task, index) => positions.set(task.id, index));
  return tasks.map((task) => ({ ...task, position: positions.get(task.id) ?? task.position }));
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
