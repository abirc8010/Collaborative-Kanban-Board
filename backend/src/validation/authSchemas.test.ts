import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, usernameSchema } from './authSchemas.js';

describe('authentication validation', () => {
  it.each(['abirc8010', 'abir_test', 'abir-test'])('accepts username %s', (username) => {
    expect(usernameSchema.parse(username)).toBe(username);
  });

  it('rejects spaces and invalid username characters', () => {
    expect(() => usernameSchema.parse('abir test')).toThrow();
    expect(() => usernameSchema.parse('abir.test')).toThrow();
  });

  it('accepts matching registration fields with a short password', () => {
    expect(registerSchema.parse({ username: 'abir_test', password: 'short', confirmPassword: 'short' }).username).toBe('abir_test');
  });

  it('rejects mismatched confirmation and empty passwords', () => {
    expect(() => registerSchema.parse({ username: 'abir-test', password: 'short', confirmPassword: 'different' })).toThrow();
    expect(() => registerSchema.parse({ username: 'abir-test', password: '', confirmPassword: '' })).toThrow();
  });

  it('uses identical strict fields for login', () => {
    expect(loginSchema.parse({ username: 'abirc8010', password: 'anything-valid' }).username).toBe('abirc8010');
  });
});
