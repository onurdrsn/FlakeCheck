import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class { constructor(public env: unknown) {} } }));
vi.mock('../src/db/client.js', () => ({ createDatabase: () => ({}) }));
import { QuarantineEntrypoint } from '../src/index.js';

describe('quarantine cron HTTP endpoint', () => {
  it('returns 500 when CRON_API_KEY is not configured', async () => {
    const entrypoint = new QuarantineEntrypoint({ DATABASE_URL: 'postgres://mock' } as never, {} as never);
    const response = await entrypoint.fetch(new Request('https://quarantine/cron/graduate', { method: 'POST' }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'CRON_API_KEY is not configured on the server' });
  });

  it('rejects unauthorized requests when key is missing or wrong', async () => {
    const entrypoint = new QuarantineEntrypoint({
      DATABASE_URL: 'postgres://mock',
      CRON_API_KEY: 'super-secret-cron-key',
    } as never, {} as never);

    const noKeyResponse = await entrypoint.fetch(new Request('https://quarantine/cron/graduate', { method: 'POST' }));
    expect(noKeyResponse.status).toBe(401);
    expect(await noKeyResponse.json()).toEqual({ error: 'Unauthorized: invalid or missing cron API key' });

    const wrongKeyResponse = await entrypoint.fetch(new Request('https://quarantine/cron/graduate', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key' },
    }));
    expect(wrongKeyResponse.status).toBe(401);
  });

  it('accepts authorization via Bearer header, X-API-Key header, or query param', async () => {
    const entrypoint = new QuarantineEntrypoint({
      DATABASE_URL: 'postgres://mock',
      CRON_API_KEY: 'super-secret-cron-key',
    } as never, {} as never);

    vi.spyOn(entrypoint, 'runGraduation').mockResolvedValue({
      repositoriesProcessed: 2,
      graduated: { 'acme/repo1': ['test-1'], 'acme/repo2': [] },
    });

    // 1. Authorization: Bearer
    const bearerRes = await entrypoint.fetch(new Request('https://quarantine/cron/graduate', {
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret-cron-key' },
    }));
    expect(bearerRes.status).toBe(200);
    expect(await bearerRes.json()).toMatchObject({
      status: 'ok',
      repositoriesProcessed: 2,
      graduated: { 'acme/repo1': ['test-1'] },
    });

    // 2. X-API-Key header
    const xApiKeyRes = await entrypoint.fetch(new Request('https://quarantine/api/cron/graduate', {
      method: 'GET',
      headers: { 'X-API-Key': 'super-secret-cron-key' },
    }));
    expect(xApiKeyRes.status).toBe(200);

    // 3. Query param key
    const queryRes = await entrypoint.fetch(new Request('https://quarantine/cron/graduate?key=super-secret-cron-key', {
      method: 'GET',
    }));
    expect(queryRes.status).toBe(200);
  });
});
