import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticate, canonicalRepo } from '../src/auth.js';

async function tokenDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('gateway authentication', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid repository token', async () => {
    const expected = await tokenDigest('secret');
    await expect(authenticate('acme/app', 'secret', { FLAKECHECK_PROJECT_TOKENS: JSON.stringify({ 'acme/app': expected }) })).resolves.toEqual({ repo: 'acme/app' });
  });

  it('rejects an invalid token and repository mismatch', async () => {
    const expected = await tokenDigest('secret');
    const env = { FLAKECHECK_PROJECT_TOKENS: JSON.stringify({ 'acme/app': expected }) };
    await expect(authenticate('acme/app', 'wrong', env)).rejects.toThrow('Invalid repository token');
    await expect(authenticate('other/app', 'secret', env)).rejects.toThrow('Repository token is not configured');
  });

  it('requires a canonical repository', async () => {
    expect(canonicalRepo(undefined)).toBeNull();
    expect(canonicalRepo('acme')).toBeNull();
    await expect(authenticate(undefined, 'secret', { FLAKECHECK_PROJECT_TOKENS: '{}' })).rejects.toThrow('canonical repo');
  });

  it('accepts a public repository when the GitHub REST API is rate-limited', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403 }))
      .mockResolvedValueOnce(new Response('<html><title>ATS-Analyzer</title></html>', { status: 200 }));

    await expect(authenticate('onurdrsn/ATS-Analyzer', undefined, { FLAKECHECK_PROJECT_TOKENS: '{}' })).resolves.toEqual({ repo: 'onurdrsn/ATS-Analyzer' });
  });
});
