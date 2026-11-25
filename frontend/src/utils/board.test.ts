import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterTasks, fromUrl, mergeBoardSnapshot, moveTask, normalize, ordered, pushUrl, writeUrl } from './board';
import type { Task } from '../types';

const seed: Task[] = [
  { id: 'a', boardId: 'test-board', title: 'Authentication flow', description: '', priority: 'high', assignee: 'Abir', status: 'Todo', position: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'b', boardId: 'test-board', title: 'Landing page', description: '', priority: 'low', assignee: 'Maya', status: 'Todo', position: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'c', boardId: 'test-board', title: 'Audit login', description: '', priority: 'high', assignee: 'Abir', status: 'Done', position: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
];

describe('board state utilities', () => {
  it('combines case-insensitive title, priority, and assignee filters without mutating positions', () => {
    const result = filterTasks(seed, { search: 'AUTH', priority: 'high', assignee: 'Abir' });
    expect(result.map((task) => task.id)).toEqual(['a']);
    expect(seed[0]?.position).toBe(1);
  });
  it('normalizes each column independently', () => {
    expect(normalize(seed).filter((task) => task.status === 'Todo').map((task) => task.position).sort()).toEqual([0, 1]);
  });
  it('does not resurrect a deleted task from a stale board response', () => {
    const deletedAt = Date.parse('2026-01-02T00:00:00.000Z');
    const staleTask = { ...seed[0]!, id: 'deleted', updatedAt: '2026-01-01T00:00:00.000Z' };
    const staleResponse = mergeBoardSnapshot([], [staleTask], new Set(), new Map([['deleted', deletedAt]]), deletedAt + 1);
    expect(staleResponse.tasks).toEqual([]);
    const newerRecreatedTask = { ...staleTask, updatedAt: '2026-01-03T00:00:00.000Z' };
    const newerResponse = mergeBoardSnapshot([], [newerRecreatedTask], new Set(), new Map([['deleted', deletedAt]]), deletedAt + 1);
    expect(newerResponse.tasks).toEqual([newerRecreatedTask]);
    expect(newerResponse.clearedTombstones).toEqual(['deleted']);
  });
  it('uses the required column order and calculates same-column and cross-column moves', () => {
    const allStatuses: Task[] = [
      { ...seed[0]!, id: 'todo', status: 'Todo' },
      { ...seed[0]!, id: 'backlog', status: 'Backlog' },
      { ...seed[0]!, id: 'done', status: 'Done' },
      { ...seed[0]!, id: 'progress', status: 'In Progress' },
    ];
    expect(ordered(allStatuses).map((task) => task.status)).toEqual(['Backlog', 'Todo', 'In Progress', 'Done']);
    const reordered = moveTask(seed, 'b', 'a', 'Todo');
    expect(reordered?.tasks.filter((task) => task.status === 'Todo').map((task) => task.id)).toEqual(['a', 'b']);
    const moved = moveTask(seed, 'a', 'column:Done', 'Done');
    expect(moved?.tasks.filter((task) => task.status === 'Done').map((task) => task.id)).toEqual(['c', 'a']);
    expect(moved?.affectedIds.sort()).toEqual(['a', 'b', 'c']);
    expect(seed[0]?.status).toBe('Todo');
  });
  it('restores valid URL state and ignores invalid enum values', () => {
    expect(fromUrl('?search=auth&priority=high&assignee=abir')).toEqual({ search: 'auth', priority: 'high', assignee: 'abir' });
    expect(fromUrl('?priority=urgent').priority).toBe('all');
  });
  it('writes and pushes filter state without a page reload', () => {
    let currentUrl = new URL('http://localhost/?old=value');
    const fakeWindow = {
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => { currentUrl = new URL(url, currentUrl); },
        pushState: (_state: unknown, _title: string, url: string) => { currentUrl = new URL(url, currentUrl); },
      },
      get location() { return currentUrl; },
    };
    vi.stubGlobal('window', fakeWindow as unknown as Window);
    writeUrl({ search: 'auth', priority: 'high', assignee: 'abir' });
    expect(window.location.search).toBe('?search=auth&priority=high&assignee=abir');
    pushUrl({ search: 'auth', priority: 'all', assignee: 'all' });
    expect(window.location.search).toBe('?search=auth');
  });
});

afterEach(() => vi.unstubAllGlobals());
