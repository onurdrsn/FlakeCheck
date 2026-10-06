import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class { constructor(public env: unknown) {} } }));
import { GatewayEntrypoint } from '../src/index.js';

function binding() {
  return {
    ingestStream: vi.fn(async () => ({ runId: 'run-1', ingestedAttempts: 2 })),
    analyzeRun: vi.fn(async () => ({ classifiedCount: 2, flakesFound: 1 })),
    calculateSummary: vi.fn(async () => ({ healthScore: 98, wasteSeconds: 12, wasteUsd: 0.0016, activeFlakes: 1 })),
    setQuarantine: vi.fn(async () => undefined),
    evaluateAutoGraduation: vi.fn(async () => ({ graduatedTestIds: [] })),
    generateSkipList: vi.fn(async () => ({})),
    fetch: vi.fn(async () => new Response('ok')),
  };
}

async function request(path: string, init: RequestInit = {}) {
  const services = { ingestion: binding(), analysis: binding(), quarantine: binding() };
  const token = 'secret';
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const env = {
    DATABASE_URL: 'https://example.invalid',
    FLAKECHECK_PROJECT_TOKENS: JSON.stringify({ 'acme/app': digest }),
    INGESTION_SERVICE: services.ingestion,
    ANALYSIS_SERVICE: services.analysis,
    QUARANTINE_SERVICE: services.quarantine,
  };
  const response = await new GatewayEntrypoint(env as never, {} as never).fetch(new Request(`https://gateway${path}`, {
    ...init,
    headers: { 'X-FlakeCheck-Token': token, ...(init.headers ?? {}) },
  }));
  return { response, services };
}

describe('gateway routes', () => {
  it('delegates summary to the analysis binding', async () => {
    const { response, services } = await request('/api/summary?repo=acme/app');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ healthScore: 98 });
    expect(services.analysis.calculateSummary).toHaveBeenCalledWith('acme/app');
  });

  it('delegates quarantine changes with the authenticated repository', async () => {
    const { response, services } = await request('/api/quarantine?repo=acme/app', {
      method: 'POST',
      body: JSON.stringify({ testId: 'test-1', state: true, reason: 'flaky' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(200);
    expect(services.quarantine.setQuarantine).toHaveBeenCalledWith('acme/app', 'test-1', true, 'flaky');
  });

  it('keeps the session endpoint ahead of the OAuth provider route', async () => {
    const { response } = await request('/api/auth/me');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });
});
