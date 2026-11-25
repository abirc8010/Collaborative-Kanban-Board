import { describe, expect, it } from 'vitest';
import { createBoardSchema, patchBoardSchema } from './boardSchemas.js';

describe('board link access validation', () => {
  it('defaults new boards to restricted access', () => {
    expect(createBoardSchema.parse({ name: 'Roadmap' })).toEqual({ name: 'Roadmap', visibility: 'private' });
  });

  it('accepts enabled Viewer and Editor link permissions', () => {
    expect(patchBoardSchema.parse({ linkAccess: { enabled: true, role: 'viewer' } }).linkAccess?.role).toBe('viewer');
    expect(patchBoardSchema.parse({ linkAccess: { enabled: true, role: 'editor' } }).linkAccess?.role).toBe('editor');
  });

  it('rejects Editor permission while general access is Restricted', () => {
    expect(() => patchBoardSchema.parse({ linkAccess: { enabled: false, role: 'editor' } })).toThrow();
  });

  it('rejects ambiguous legacy visibility and explicit link access patches', () => {
    expect(() => patchBoardSchema.parse({ visibility: 'public', linkAccess: { enabled: true, role: 'viewer' } })).toThrow();
  });
});
