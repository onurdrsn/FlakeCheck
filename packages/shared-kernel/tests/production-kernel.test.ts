import { describe, expect, it } from 'vitest';
import { hasApiScope, hasRoleAtLeast, redactValue, requiredRoleForAction, withRetry } from '../src/index.js';

describe('production kernel utilities', () => {
  it('redacts sensitive keys and bearer/postgres tokens from log payloads', () => {
    const redacted = redactValue({
      token: 'super-secret',
      databaseUrl: 'postgres://user:pass@host/db',
      message: 'Failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      nested: { apiKey: 'fc_1234567890abcdef1234', safe: 'ok' },
    }) as Record<string, unknown>;
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.databaseUrl).toBe('[REDACTED]');
    expect(String(redacted.message)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect((redacted.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).safe).toBe('ok');
  });

  it('enforces RBAC role hierarchy and API key scopes', () => {
    expect(hasRoleAtLeast('owner', 'admin')).toBe(true);
    expect(hasRoleAtLeast('admin', 'member')).toBe(true);
    expect(hasRoleAtLeast('viewer', 'member')).toBe(false);
    expect(requiredRoleForAction('runs:delete')).toBe('admin');
    expect(requiredRoleForAction('org:delete')).toBe('owner');
    expect(hasApiScope(['read', 'ingest'], 'ingest')).toBe(true);
    expect(hasApiScope(['read'], 'quarantine')).toBe(false);
    expect(hasApiScope(['admin'], 'quarantine')).toBe(true);
  });

  it('retries transient errors and returns result when recovered', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('Connection timeout');
      return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 10, timeoutMs: 1000 });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});
