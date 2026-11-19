import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { createCronRouter, type CronEnv, type CronExecutors, type CronRunRecord, type CronStore } from '../src/cron.js';
import { createV1Router, type V1Env } from '../src/v1-routes.js';
import { RateLimiterDO, resetFallbackRateLimits } from '../src/rate-limit.js';
import { computeHmacSha256Hex, securityHeadersMiddleware, verifyWebhookRequest } from '../src/security.js';
import { buildOpenApiSpec } from '../src/openapi.js';

function createInMemoryCronStore(): { store: CronStore; runs: Map<string, CronRunRecord> } {
  const runs = new Map<string, CronRunRecord>();
  const keyOf = (jobType: string, periodKey: string, dryRun: boolean) => `${jobType}:${periodKey}:${dryRun}`;
  return {
    runs,
    store: {
      async findRun(jobType, periodKey, dryRun) {
        return runs.get(keyOf(jobType, periodKey, dryRun)) ?? null;
      },
      async createRun(run) {
        const key = keyOf(run.jobType, run.periodKey, run.dryRun);
        if (runs.has(key)) return false;
        runs.set(key, { ...run });
        return true;
      },
      async updateRun(id, patch) {
        for (const [k, v] of runs.entries()) {
          if (v.id === id) {
            runs.set(k, { ...v, ...patch });
            return;
          }
        }
      },
    },
  };
}

describe('Phase 2 Production Hardening', () => {
  beforeEach(() => {
    resetFallbackRateLimits();
  });

  describe('1. cron-job.org protected cron endpoints', () => {
    const baseEnv: CronEnv = {
      DATABASE_URL: 'https://example.invalid',
      CRON_SECRET: 'cron_live_primary_secret_token_2026',
      CRON_SECRET_PREVIOUS: 'cron_live_previous_secret_token_2025',
      PUBLIC_APP_URL: 'https://flakecheck.onurd.com.tr',
      RATE_LIMIT_CRON_MAX: '50',
    };

    const noopExecutors = (): CronExecutors => ({
      fetchDigestBatch: async () => ({ items: [], nextCursor: null }),
      sendDigest: async () => 'sent',
      fetchRetentionBatch: async () => ({ items: [], nextCursor: null }),
      pruneProject: async () => ({ runsDeleted: 0, deliveriesDeleted: 0 }),
      recordRetentionAudit: async () => undefined,
    });

    it('rejects missing, invalid, session-cookie, and API-key requests with 401 + WWW-Authenticate + noindex', async () => {
      const { store } = createInMemoryCronStore();
      const app = createCronRouter({ storeFactory: () => store, executorsFactory: noopExecutors });

      const missing = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', { method: 'POST' }, baseEnv);
      expect(missing.status).toBe(401);
      expect(missing.headers.get('WWW-Authenticate')).toContain('Bearer');
      expect(missing.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');

      const wrong = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong_token' },
      }, baseEnv);
      expect(wrong.status).toBe(401);

      // Normal API key or user session cookie must NOT grant access
      const apiKeyOnly = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/retention?dryRun=true', {
        method: 'POST',
        headers: { 'X-FlakeCheck-Token': 'fc_user_api_key', Cookie: 'flakecheck_session=jwt-session' },
      }, baseEnv);
      expect(apiKeyOnly.status).toBe(401);
    });

    it('accepts both CRON_SECRET and CRON_SECRET_PREVIOUS (zero-downtime rotation)', async () => {
      const { store } = createInMemoryCronStore();
      const app = createCronRouter({ storeFactory: () => store, executorsFactory: noopExecutors });

      const currentRes = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET}` },
      }, baseEnv);
      expect(currentRes.status).toBe(202);

      const prevRes = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=weekly', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET_PREVIOUS}` },
      }, baseEnv);
      expect(prevRes.status).toBe(202);
    });

    it('enforces idempotency on duplicate triggers within the same period', async () => {
      const { store } = createInMemoryCronStore();
      const sendSpy = vi.fn(async () => 'sent' as const);
      const executors: CronExecutors = {
        ...noopExecutors(),
        fetchDigestBatch: async () => ({
          items: [{
            pref: {
              id: 'pref-1',
              repo: 'acme/app',
              channel: 'slack',
              target: 'https://hooks.slack.com/services/T/B/X',
              events: ['DAILY_DIGEST'],
              digestFrequency: 'daily',
              dedupWindowMinutes: 60,
              rateLimitPerHour: 20,
              enabled: true,
            },
            metrics: { healthScore: 95, activeFlakes: 1, quarantinedCount: 0, wasteMinutes: 5, wasteUsd: 0.04, topFlakyTests: [] },
          }],
          nextCursor: null,
        }),
        sendDigest: sendSpy,
      };
      const app = createCronRouter({
        storeFactory: () => store,
        executorsFactory: () => executors,
        now: () => new Date('2026-11-19T08:00:00Z'),
      });

      const r1 = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET}` },
      }, baseEnv);
      const b1 = (await r1.json()) as { idempotentReplay: boolean; affectedCount: number };
      expect(r1.status).toBe(202);
      expect(b1.idempotentReplay).toBe(false);
      expect(b1.affectedCount).toBe(1);
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Second trigger on same day must be an idempotent replay with 0 extra sends
      const r2 = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET}` },
      }, baseEnv);
      const b2 = (await r2.json()) as { idempotentReplay: boolean };
      expect(r2.status).toBe(202);
      expect(b2.idempotentReplay).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('supports retention dryRun mode and resumes failed batches from saved cursor', async () => {
      const { store } = createInMemoryCronStore();
      const auditCalls: Array<{ repo: string; dryRun: boolean }> = [];
      let failOnce = true;
      const visitedRepos: string[] = [];

      const executors: CronExecutors = {
        ...noopExecutors(),
        fetchRetentionBatch: async (cursor) => {
          if (!cursor) {
            return { items: [{ id: 'p1', repo: 'acme/one', retentionDays: 30 }], nextCursor: 'p1' };
          }
          if (cursor === 'p1') {
            if (failOnce) {
              failOnce = false;
              throw new Error('Simulated transient Neon timeout on batch 2');
            }
            return { items: [{ id: 'p2', repo: 'acme/two', retentionDays: 60 }], nextCursor: null };
          }
          return { items: [], nextCursor: null };
        },
        pruneProject: async (repo) => {
          visitedRepos.push(repo);
          return { runsDeleted: 4, deliveriesDeleted: 2 };
        },
        recordRetentionAudit: async (repo, details) => {
          auditCalls.push({ repo, dryRun: details.dryRun });
        },
      };

      const app = createCronRouter({
        storeFactory: () => store,
        executorsFactory: () => executors,
        now: () => new Date('2026-11-19T03:00:00Z'),
        batchSize: 1,
      });

      // Attempt 1 fails on batch 2 after persisting cursor 'p1'
      const first = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/retention?dryRun=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET}` },
      }, baseEnv);
      const firstJson = (await first.json()) as { status: string; processedCount: number };
      expect(first.status).toBe(202);
      expect(firstJson.status).toBe('failed');
      expect(firstJson.processedCount).toBe(1);

      // Attempt 2 resumes from cursor 'p1' and processes only 'acme/two'
      const second = await app.request('https://flakecheck.onurd.com.tr/api/v1/internal/cron/retention?dryRun=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${baseEnv.CRON_SECRET}` },
      }, baseEnv);
      const secondJson = (await second.json()) as { status: string; processedCount: number; affectedCount: number };
      expect(second.status).toBe(202);
      expect(secondJson.status).toBe('completed');
      expect(secondJson.processedCount).toBe(2);
      expect(secondJson.affectedCount).toBe(12);
      expect(visitedRepos).toEqual(['acme/one', 'acme/two']);
      expect(auditCalls.every((c) => c.dryRun === true)).toBe(true);
    });

    it('hides internal cron routes from the public OpenAPI 3.1 spec', () => {
      const spec = buildOpenApiSpec('https://flakecheck.onurd.com.tr');
      const paths = Object.keys(spec.paths);
      expect(paths.some((p) => p.includes('/internal/cron'))).toBe(false);
    });
  });

  describe('2. Distributed Rate Limiter (Durable Object + per-tier limits)', () => {
    it('enforces atomic sliding window limits inside RateLimiterDO and returns 429 with Retry-After', async () => {
      const storageMap = new Map<string, unknown>();
      const fakeState = {
        storage: {
          get: async <T>(key: string) => storageMap.get(key) as T | undefined,
          put: async (entries: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(entries)) storageMap.set(k, v);
          },
        },
      } as unknown as DurableObjectState;

      const doInstance = new RateLimiterDO(fakeState);
      const r1 = await doInstance.fetch(new Request('https://rate-limiter.internal/check?limit=2&windowMs=60000'));
      const r2 = await doInstance.fetch(new Request('https://rate-limiter.internal/check?limit=2&windowMs=60000'));
      const r3 = await doInstance.fetch(new Request('https://rate-limiter.internal/check?limit=2&windowMs=60000'));

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
      const body3 = (await r3.json()) as { allowed: boolean; retryAfterSeconds: number };
      expect(body3.allowed).toBe(false);
      expect(body3.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Security Hardening: RBAC/Zod scan, Webhook Replay Protection, CSP & Migrations', () => {
    it('rejects unauthenticated requests on protected /api/v1/* routes and validates Zod inputs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
      try {
        const { digestHex } = await import('../src/auth.js');
        const v1 = createV1Router();
        const env = {
          DATABASE_URL: 'https://example.invalid',
          FLAKECHECK_PROJECT_TOKENS: JSON.stringify({ 'acme/app': await digestHex('secret-token') }),
          JWT_SECRET: 'test-jwt-secret',
          CI_WEBHOOK_SECRET: 'whsec_replay_test',
          INGESTION_SERVICE: { ingestStream: vi.fn(), fetch: vi.fn() },
          ANALYSIS_SERVICE: { analyzeRun: vi.fn(), calculateSummary: vi.fn() },
          QUARANTINE_SERVICE: { setQuarantine: vi.fn(), evaluateAutoGraduation: vi.fn(), generateSkipList: vi.fn() },
        } as unknown as V1Env;

        const protectedRoutes: Array<{ method: string; path: string }> = [
          { method: 'GET', path: '/api/v1/analytics/overview?repo=acme/app' },
          { method: 'GET', path: '/api/v1/quarantine/policy?repo=acme/app' },
          { method: 'PUT', path: '/api/v1/quarantine/policy?repo=acme/app' },
          { method: 'GET', path: '/api/v1/notifications/preferences?repo=acme/app' },
          { method: 'POST', path: '/api/v1/notifications/preferences?repo=acme/app' },
          { method: 'GET', path: '/api/v1/organizations' },
          { method: 'POST', path: '/api/v1/organizations' },
          { method: 'POST', path: '/api/v1/tokens' },
          { method: 'GET', path: '/api/v1/audit-logs?repo=acme/app' },
          { method: 'GET', path: '/api/v1/issue-trackers?repo=acme/app' },
          { method: 'GET', path: '/api/v1/account/export' },
        ];

        for (const route of protectedRoutes) {
          const res = await v1.request(`https://flakecheck.onurd.com.tr${route.path}`, { method: route.method }, env);
          expect(res.status, `${route.method} ${route.path} should require auth`).toBe(401);
        }

        // Authenticated with valid project token (no ?repo= needed) + invalid Zod body -> 400
        const badPolicy = await v1.request('https://flakecheck.onurd.com.tr/api/v1/quarantine/policy', {
          method: 'PUT',
          headers: { 'X-FlakeCheck-Token': 'secret-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ flakinessScoreThreshold: 999 }),
        }, env);
        expect(badPolicy.status).toBe(400);

        // Empty body on PUT /api/v1/quarantine/policy must be rejected with 400
        const emptyPolicy = await v1.request('https://flakecheck.onurd.com.tr/api/v1/quarantine/policy', {
          method: 'PUT',
          headers: { 'X-FlakeCheck-Token': 'secret-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }, env);
        expect(emptyPolicy.status).toBe(400);

        // Explicit repo mismatch against token scope must be rejected with 403
        const mismatchRepo = await v1.request('https://flakecheck.onurd.com.tr/api/v1/quarantine/policy?repo=other/repo', {
          method: 'GET',
          headers: { 'X-FlakeCheck-Token': 'secret-token' },
        }, env);
        expect(mismatchRepo.status).toBe(403);

        // Unfilled template variables on badge endpoint must be rejected with 400
        const unfilledBadge = await v1.request('https://flakecheck.onurd.com.tr/api/v1/badge/%7Bowner%7D/%7Brepo%7D.svg', {
          method: 'GET',
        }, env);
        expect(unfilledBadge.status).toBe(400);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('rejects replayed webhook requests outside timestamp tolerance and accepts fresh signed payloads', async () => {
      const secret = 'whsec_prod_secret';
      const body = JSON.stringify({ repo: 'acme/app', commitSha: 'abc1234' });
      const nowMs = Date.UTC(2026, 10, 19, 12, 0, 0);
      const freshTs = String(Math.floor(nowMs / 1000) - 30);
      const staleTs = String(Math.floor(nowMs / 1000) - 600);

      const freshSig = `sha256=${await computeHmacSha256Hex(secret, `${freshTs}.${body}`)}`;
      const staleSig = `sha256=${await computeHmacSha256Hex(secret, `${staleTs}.${body}`)}`;

      expect((await verifyWebhookRequest({ secret, rawBody: body, signatureHeader: freshSig, timestampHeader: freshTs, nowMs })).valid).toBe(true);
      const staleResult = await verifyWebhookRequest({ secret, rawBody: body, signatureHeader: staleSig, timestampHeader: staleTs, nowMs });
      expect(staleResult.valid).toBe(false);
      expect(staleResult.reason).toContain('replay tolerance');
    });

    it('applies CSP compatible with dashboard assets, Google Fonts, and GitHub OAuth/API while blocking framing', async () => {
      const app = new Hono();
      app.use('*', securityHeadersMiddleware());
      app.get('/app', (c) => c.html('<html><body>Dashboard</body></html>'));

      const res = await app.request('https://flakecheck.onurd.com.tr/app');
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('https://api.github.com');
      expect(csp).toContain('https://fonts.googleapis.com');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    });

    it('verifies additive Drizzle migrations 0005 and 0006 exist and define cron_runs idempotency index', () => {
      const root = resolve(process.cwd(), '../..');
      const m0005 = readFileSync(resolve(root, 'drizzle/0005_misty_spitfire.sql'), 'utf8');
      const m0006 = readFileSync(resolve(root, 'drizzle/0006_tired_robin_chapel.sql'), 'utf8');
      expect(m0005).toContain('CREATE TABLE "organizations"');
      expect(m0005).toContain('CREATE TABLE "audit_logs"');
      expect(m0005).not.toMatch(/DROP TABLE/i);
      expect(m0006).toContain('CREATE TABLE "cron_runs"');
      expect(m0006).toContain('cron_runs_job_period_dry_idx');
      expect(m0006).not.toMatch(/DROP TABLE/i);
    });
  });
});
