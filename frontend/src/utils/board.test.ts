import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterTasks, fromUrl, normalize, pushUrl, writeUrl } from './board';
import type { Task } from '../types';

const seed: Task[] = [
  { id: 'a', title: 'Authentication flow', description: '', priority: 'high', assignee: 'Abir', status: 'Todo', position: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'b', title: 'Landing page', description: '', priority: 'low', assignee: 'Maya', status: 'Todo', position: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'c', title: 'Audit login', description: '', priority: 'high', assignee: 'Abir', status: 'Done', position: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
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
