import { describe, expect, it } from 'vitest';
import { boardPath, resolveBoardRoute } from './boardRoute';

describe('board URL routing', () => {
  it('resolves a direct path route so refreshes load the same board', () => {
    expect(resolveBoardRoute('/board/65f0a1000000000000000001', '')).toEqual({ boardId: '65f0a1000000000000000001', path: '/board/65f0a1000000000000000001', legacy: false });
  });

  it('canonicalizes legacy query URLs while preserving task filters', () => {
    expect(resolveBoardRoute('/', '?board=65f0a1000000000000000001&search=launch&priority=high')).toEqual({
      boardId: '65f0a1000000000000000001',
      path: '/board/65f0a1000000000000000001?search=launch&priority=high',
      legacy: true,
    });
  });

  it('generates a path-based board link', () => {
    expect(boardPath('board id')).toBe('/board/board%20id');
  });
});
