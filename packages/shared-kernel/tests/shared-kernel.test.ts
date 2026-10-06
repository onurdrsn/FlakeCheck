import { describe, expect, it } from 'vitest';
import {
  createAttemptId,
  createEnvironmentFingerprint,
  createFailureSignature,
  createTestId,
  normalizeFailureText,
  sanitizeSecrets,
  sha256,
} from '../src/index.js';
import { emailOtp, expiredSessionCookie, secureOtp, sessionCookie, signJwt, verifyJwt } from '../src/auth.js';

describe('authentication primitives', () => {
  it('creates secure OTP material and HttpOnly session cookies', async () => {
    const otp = secureOtp();
    expect(otp).toHaveLength(24);
    expect(/[A-Z]/.test(otp)).toBe(true);
    expect(/[a-z]/.test(otp)).toBe(true);
    expect(/[0-9]/.test(otp)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(otp)).toBe(true);
    const token = await signJwt({ sub: 'user-1' }, 'test-secret');
    expect(await verifyJwt(token, 'test-secret')).toMatchObject({ sub: 'user-1' });
    expect(await verifyJwt(token, 'wrong-secret')).toBeNull();
    expect(await verifyJwt(token, 'test-secret', Math.floor(Date.now() / 1000) + 31 * 24 * 60 * 60)).toBeNull();
    expect(sessionCookie(token)).toContain('HttpOnly');
    expect(sessionCookie(token)).toContain('Secure');
    expect(sessionCookie(token)).toContain('SameSite=Lax');
    expect(expiredSessionCookie()).toContain('Max-Age=0');
  });

  it('creates six-digit numeric email OTPs', () => {
    const otp = emailOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('secret sanitization', () => {
  it('masks bearer, JWT, and key-value credentials', () => {
    const input = 'Bearer abcdefghijklmnopqrstuvwxyz password=super-secret eyJhbGciOiJIUzI1NiJ9.abc.def';
    const output = sanitizeSecrets(input);
    expect(output).toContain('<SECRET_MASKED>');
    expect(output).toContain('<JWT_MASKED>');
    expect(output).toContain('password=<REDACTED>');
    expect(output).not.toContain('super-secret');
  });
});

describe('failure signatures', () => {
  it('normalizes all specified volatile values', async () => {
    const raw = '2025-01-02T03:04:05Z failed at localhost:54321 0xabcdef12 /home/alice/app (12.5ms)\n at fn (x.ts:1)';
    const normalized = normalizeFailureText(raw);
    expect(normalized).toContain('<TIMESTAMP>');
    expect(normalized).toContain('localhost:<PORT>');
    expect(normalized).toContain('<HEX>');
    expect(normalized).toContain('<PATH>');
    expect(normalized).toContain('(<DURATION>)');
    expect(await createFailureSignature({ errorType: 'Error', rawError: raw })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('identity hashing', () => {
  it('produces deterministic SHA-256 identities', async () => {
    expect(await sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const testId = await createTestId({ repository: 'acme/app', normalizedFilepath: 'tests\\unit.test.ts', suiteHierarchy: ['unit'], testName: 'works' });
    expect(testId).toMatch(/^[0-9a-f]{64}$/);
    expect(await createAttemptId('run', testId, 1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serializes the environment dimensions deterministically', async () => {
    const result = await createEnvironmentFingerprint({ os: ' Linux ', runtime_name: 'Node.js' });
    expect(result.serialized).toContain('os=linux');
    expect(result.serialized).toContain('runtime_name=node.js');
    expect(result.serialized).toContain('container_image_digest=<none>');
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
