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

  it('returns detailed health status and structured diagnostic checks for all services and database', async () => {
    const { response } = await request('/api/health');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      gateway: 'ok',
      summary: {
        totalChecks: 4,
        fulfilled: 3,
        rejected: 1,
        totalDurationMs: expect.any(Number),
      },
      services: expect.arrayContaining([
        expect.objectContaining({ id: 'ingestion-service', name: 'Ingestion Service', status: 'ok' }),
        expect.objectContaining({ id: 'analysis-service', name: 'Analysis Service', status: 'ok' }),
        expect.objectContaining({ id: 'quarantine-service', name: 'Quarantine Service', status: 'ok' }),
        expect.objectContaining({ id: 'neon-postgres', name: 'Neon Database (PostgreSQL)', status: 'error' }),
      ]),
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: 'ingestion-service',
          name: 'Ingestion Service',
          component: 'flakecheck-ingestion-service',
          type: 'cloudflare-worker-rpc',
          state: 'fulfilled',
          status: 'ok',
          healthy: true,
          httpStatus: 200,
          durationMs: expect.any(Number),
          detail: expect.stringContaining('Service Binding RPC'),
        }),
        expect.objectContaining({
          id: 'neon-postgres',
          name: 'Neon Database (PostgreSQL)',
          component: 'neondatabase-serverless',
          type: 'postgresql-database',
          state: 'rejected',
          status: 'error',
          healthy: false,
        }),
      ]),
    });
  });

  it('routes unauthenticated POST /api/v1/internal/cron/digest?type=daily to cron handler (401 JSON) and never falls back to ASSETS on /api/* or non-GET', async () => {
    const services = { ingestion: binding(), analysis: binding(), quarantine: binding() };
    const assetsFetch = vi.fn(async (req: Request) =>
      req.method === 'GET' ? new Response('<html>SPA</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) : new Response(null, { status: 405 }),
    );
    const env = {
      DATABASE_URL: 'https://example.invalid',
      CRON_SECRET: 'cron_secret_primary_test_token',
      FLAKECHECK_PROJECT_TOKENS: '{}',
      INGESTION_SERVICE: services.ingestion,
      ANALYSIS_SERVICE: services.analysis,
      QUARANTINE_SERVICE: services.quarantine,
      ASSETS: { fetch: assetsFetch },
    };
    const gateway = new GatewayEntrypoint(env as never, {} as never);

    const cronRes = await gateway.fetch(
      new Request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', { method: 'POST' }),
    );
    expect(cronRes.status).toBe(401);
    expect(cronRes.headers.get('content-type')).toContain('application/json');
    expect(cronRes.headers.get('www-authenticate')).toContain('Bearer');
    expect(cronRes.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(assetsFetch).not.toHaveBeenCalled();

    const authedCronRes = await gateway.fetch(
      new Request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron_secret_primary_test_token' },
      }),
    );
    expect(authedCronRes.status).toBe(202);
    expect(authedCronRes.headers.get('content-type')).toContain('application/json');
    expect(authedCronRes.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(assetsFetch).not.toHaveBeenCalled();

    // Unknown non-GET request must return 404 from worker, never 405 from ASSETS
    const unknownPost = await gateway.fetch(
      new Request('https://flakecheck.onurd.com.tr/unmatched-post-path', { method: 'POST' }),
    );
    expect(unknownPost.status).toBe(404);
    expect(assetsFetch).not.toHaveBeenCalled();
  });
});


