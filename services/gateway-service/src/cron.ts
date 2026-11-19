import { Hono } from 'hono';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import {
  auditLogs,
  createLogger,
  cronRuns,
  notificationDeliveries,
  notificationPreferences,
  projects,
  runs,
} from '@flakecheck/shared-kernel';
import type { AnalysisRPC } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';
import { timingSafeEqualStrings, recordAuditLog } from './security.js';
import { distributedRateLimit, type RateLimitEnv } from './rate-limit.js';
import { buildDigestPayload, dispatchAlert, type AlertChannel, type DeliveryStore, type NotificationPreferenceRecord } from './notifications.js';

export interface CronEnv extends RateLimitEnv {
  DATABASE_URL: string;
  CRON_SECRET?: string;
  CRON_SECRET_PREVIOUS?: string;
  PUBLIC_APP_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ANALYSIS_SERVICE?: AnalysisRPC;
  CRON_QUEUE?: { send(message: unknown): Promise<void> };
}

export type CronJobType = 'digest_daily' | 'digest_weekly' | 'retention';

export interface CronRunRecord {
  id: string;
  jobType: CronJobType;
  periodKey: string;
  status: 'running' | 'completed' | 'failed';
  dryRun: boolean;
  cursor: string | null;
  processedCount: number;
  affectedCount: number;
  errorCount: number;
  errorMessage: string | null;
}

export interface CronStore {
  findRun(jobType: CronJobType, periodKey: string, dryRun: boolean): Promise<CronRunRecord | null>;
  createRun(run: CronRunRecord): Promise<boolean>; // false on unique conflict
  updateRun(id: string, patch: Partial<Omit<CronRunRecord, 'id' | 'jobType' | 'periodKey' | 'dryRun'>> & { finishedAt?: Date | null }): Promise<void>;
}

export interface DigestTargetBatch {
  items: Array<{
    pref: NotificationPreferenceRecord;
    metrics: {
      healthScore: number;
      activeFlakes: number;
      quarantinedCount: number;
      wasteMinutes: number;
      wasteUsd: number;
      topFlakyTests: Array<{ testName: string; flakinessScore: number }>;
    };
  }>;
  nextCursor: string | null;
}

export interface RetentionProjectBatch {
  items: Array<{
    id: string;
    repo: string;
    retentionDays: number;
  }>;
  nextCursor: string | null;
}

export interface CronExecutors {
  fetchDigestBatch(frequency: 'daily' | 'weekly', cursor: string | null, batchSize: number): Promise<DigestTargetBatch>;
  sendDigest(pref: NotificationPreferenceRecord, payload: ReturnType<typeof buildDigestPayload>): Promise<'sent' | 'deduplicated' | 'rate_limited' | 'failed' | 'skipped'>;
  fetchRetentionBatch(cursor: string | null, batchSize: number): Promise<RetentionProjectBatch>;
  pruneProject(repo: string, cutoff: Date, dryRun: boolean): Promise<{ runsDeleted: number; deliveriesDeleted: number }>;
  recordRetentionAudit(repo: string, details: { dryRun: boolean; cutoff: string; runsDeleted: number; deliveriesDeleted: number; runId: string }): Promise<void>;
}

const log = createLogger('gateway-cron');
export const DEFAULT_CRON_BATCH_SIZE = 25;

/**
 * Computes deterministic UTC period keys for idempotency locking:
 * - daily / retention: YYYY-MM-DD (UTC)
 * - weekly: YYYY-Www (ISO 8601 week in UTC)
 */
export function computePeriodKey(jobType: CronJobType, now = new Date()): string {
  if (jobType === 'digest_weekly') {
    const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Timing-safe Bearer token verification supporting zero-downtime dual-secret rotation
 * (`CRON_SECRET` and `CRON_SECRET_PREVIOUS`). Rejects user sessions and project API keys.
 */
export function verifyCronBearerToken(
  authHeader: string | undefined,
  env: Pick<CronEnv, 'CRON_SECRET' | 'CRON_SECRET_PREVIOUS'>,
): { ok: boolean; matchedSlot?: 'current' | 'previous'; reason?: string } {
  const current = env.CRON_SECRET?.trim() ?? '';
  const previous = env.CRON_SECRET_PREVIOUS?.trim() ?? '';
  if (!current && !previous) {
    return { ok: false, reason: 'CRON_SECRET is not configured on this worker' };
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'Missing Bearer Authorization header' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, reason: 'Empty Bearer token' };
  }

  // Always compare against both slots to avoid leaking which slot matched via timing
  const matchCurrent = current.length > 0 && timingSafeEqualStrings(token, current);
  const matchPrevious = previous.length > 0 && timingSafeEqualStrings(token, previous);

  if (matchCurrent) return { ok: true, matchedSlot: 'current' };
  if (matchPrevious) return { ok: true, matchedSlot: 'previous' };
  return { ok: false, reason: 'Invalid cron Bearer token' };
}

export async function runDigestJob(
  frequency: 'daily' | 'weekly',
  run: CronRunRecord,
  store: CronStore,
  executors: CronExecutors,
  dashboardUrl?: string,
  batchSize = DEFAULT_CRON_BATCH_SIZE,
): Promise<CronRunRecord> {
  let cursor = run.cursor;
  let processed = run.processedCount;
  let affected = run.affectedCount;
  let errors = run.errorCount;

  try {
    while (true) {
      const batch = await executors.fetchDigestBatch(frequency, cursor, batchSize);
      for (const item of batch.items) {
        processed += 1;
        const payload = buildDigestPayload(frequency, item.pref.repo, item.metrics, dashboardUrl);
        const status = await executors.sendDigest(item.pref, payload);
        if (status === 'sent') affected += 1;
        else if (status === 'failed') errors += 1;
      }
      cursor = batch.nextCursor;
      await store.updateRun(run.id, {
        cursor,
        processedCount: processed,
        affectedCount: affected,
        errorCount: errors,
      });
      if (!cursor) break;
    }

    const finishedAt = new Date();
    await store.updateRun(run.id, {
      status: 'completed',
      cursor: null,
      processedCount: processed,
      affectedCount: affected,
      errorCount: errors,
      errorMessage: null,
      finishedAt,
    });
    log.info('cron_digest_completed', { runId: run.id, frequency, processed, affected, errors });
    return { ...run, status: 'completed', cursor: null, processedCount: processed, affectedCount: affected, errorCount: errors, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateRun(run.id, {
      status: 'failed',
      cursor,
      processedCount: processed,
      affectedCount: affected,
      errorCount: errors + 1,
      errorMessage: message,
      finishedAt: new Date(),
    });
    log.error('cron_digest_failed', { runId: run.id, frequency, cursor, error: message });
    return { ...run, status: 'failed', cursor, processedCount: processed, affectedCount: affected, errorCount: errors + 1, errorMessage: message };
  }
}

export async function runRetentionJob(
  run: CronRunRecord,
  store: CronStore,
  executors: CronExecutors,
  now = new Date(),
  batchSize = DEFAULT_CRON_BATCH_SIZE,
): Promise<CronRunRecord> {
  let cursor = run.cursor;
  let processed = run.processedCount;
  let affected = run.affectedCount;
  let errors = run.errorCount;

  try {
    while (true) {
      const batch = await executors.fetchRetentionBatch(cursor, batchSize);
      for (const project of batch.items) {
        processed += 1;
        const days = Math.max(1, project.retentionDays || 90);
        const cutoff = new Date(now.getTime() - days * 86_400_000);
        const counts = await executors.pruneProject(project.repo, cutoff, run.dryRun);
        affected += counts.runsDeleted + counts.deliveriesDeleted;
        await executors.recordRetentionAudit(project.repo, {
          dryRun: run.dryRun,
          cutoff: cutoff.toISOString(),
          runsDeleted: counts.runsDeleted,
          deliveriesDeleted: counts.deliveriesDeleted,
          runId: run.id,
        });
      }
      cursor = batch.nextCursor;
      await store.updateRun(run.id, {
        cursor,
        processedCount: processed,
        affectedCount: affected,
        errorCount: errors,
      });
      if (!cursor) break;
    }

    await store.updateRun(run.id, {
      status: 'completed',
      cursor: null,
      processedCount: processed,
      affectedCount: affected,
      errorCount: errors,
      errorMessage: null,
      finishedAt: new Date(),
    });
    log.info('cron_retention_completed', { runId: run.id, dryRun: run.dryRun, processed, affected });
    return { ...run, status: 'completed', cursor: null, processedCount: processed, affectedCount: affected, errorCount: errors, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateRun(run.id, {
      status: 'failed',
      cursor,
      processedCount: processed,
      affectedCount: affected,
      errorCount: errors + 1,
      errorMessage: message,
      finishedAt: new Date(),
    });
    log.error('cron_retention_failed', { runId: run.id, dryRun: run.dryRun, cursor, error: message });
    return { ...run, status: 'failed', cursor, processedCount: processed, affectedCount: affected, errorCount: errors + 1, errorMessage: message };
  }
}

function createDrizzleCronStore(databaseUrl: string): CronStore {
  const db = createDatabase(databaseUrl);
  return {
    async findRun(jobType, periodKey, dryRun) {
      const rows = await db
        .select()
        .from(cronRuns)
        .where(and(eq(cronRuns.jobType, jobType), eq(cronRuns.periodKey, periodKey), eq(cronRuns.dryRun, dryRun)))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        jobType: r.jobType as CronJobType,
        periodKey: r.periodKey,
        status: r.status as CronRunRecord['status'],
        dryRun: r.dryRun,
        cursor: r.cursor,
        processedCount: r.processedCount,
        affectedCount: r.affectedCount,
        errorCount: r.errorCount,
        errorMessage: r.errorMessage,
      };
    },
    async createRun(run) {
      const res = await db
        .insert(cronRuns)
        .values({
          id: run.id,
          jobType: run.jobType,
          periodKey: run.periodKey,
          status: run.status,
          dryRun: run.dryRun,
          cursor: run.cursor,
          processedCount: run.processedCount,
          affectedCount: run.affectedCount,
          errorCount: run.errorCount,
          errorMessage: run.errorMessage,
        })
        .onConflictDoNothing()
        .returning({ id: cronRuns.id });
      return res.length > 0;
    },
    async updateRun(id, patch) {
      await db.update(cronRuns).set(patch).where(eq(cronRuns.id, id));
    },
  };
}

function createDrizzleCronExecutors(env: CronEnv): CronExecutors {
  const db = createDatabase(env.DATABASE_URL);
  const deliveryStore: DeliveryStore = {
    async wasRecentlyDelivered(dedupKey, withinMinutes) {
      const cutoff = new Date(Date.now() - withinMinutes * 60_000);
      const rows = await db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(and(eq(notificationDeliveries.dedupKey, dedupKey), eq(notificationDeliveries.status, 'sent'), gt(notificationDeliveries.createdAt, cutoff)))
        .limit(1);
      return rows.length > 0;
    },
    async countRecentDeliveries(repo, channel, withinMinutes) {
      const cutoff = new Date(Date.now() - withinMinutes * 60_000);
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationDeliveries)
        .where(and(eq(notificationDeliveries.repo, repo), eq(notificationDeliveries.channel, channel), gt(notificationDeliveries.createdAt, cutoff)));
      return rows[0]?.count ?? 0;
    },
    async recordDelivery(entry) {
      await db.insert(notificationDeliveries).values({
        id: crypto.randomUUID(),
        repo: entry.repo,
        channel: entry.channel,
        eventType: entry.eventType,
        dedupKey: entry.dedupKey,
        status: entry.status,
        error: entry.error ?? null,
      });
    },
  };

  return {
    async fetchDigestBatch(frequency, cursor, batchSize) {
      const conditions = [
        eq(notificationPreferences.enabled, true),
        eq(notificationPreferences.digestFrequency, frequency),
      ];
      if (cursor) conditions.push(gt(notificationPreferences.id, cursor));
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(and(...conditions))
        .orderBy(asc(notificationPreferences.id))
        .limit(batchSize + 1);

      const hasMore = rows.length > batchSize;
      const page = hasMore ? rows.slice(0, batchSize) : rows;
      const items = await Promise.all(
        page.map(async (row) => {
          let healthScore = 100;
          let activeFlakes = 0;
          let wasteMinutes = 0;
          let wasteUsd = 0;
          if (env.ANALYSIS_SERVICE) {
            try {
              const s = await env.ANALYSIS_SERVICE.calculateSummary(row.repo);
              healthScore = s.healthScore;
              activeFlakes = s.activeFlakes;
              wasteMinutes = s.wasteSeconds / 60;
              wasteUsd = s.wasteUsd;
            } catch {
              // Keep neutral metrics if summary unavailable
            }
          }
          return {
            pref: {
              id: row.id,
              repo: row.repo,
              channel: row.channel as AlertChannel,
              target: row.target,
              signingSecret: row.signingSecret,
              events: row.events,
              digestFrequency: row.digestFrequency as 'realtime' | 'daily' | 'weekly',
              dedupWindowMinutes: row.dedupWindowMinutes,
              rateLimitPerHour: row.rateLimitPerHour,
              enabled: row.enabled,
            },
            metrics: { healthScore, activeFlakes, quarantinedCount: 0, wasteMinutes, wasteUsd, topFlakyTests: [] },
          };
        }),
      );
      return {
        items,
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      };
    },
    async sendDigest(pref, payload) {
      const outcome = await dispatchAlert(pref, payload, deliveryStore, {
        ...(env.RESEND_API_KEY ? { RESEND_API_KEY: env.RESEND_API_KEY } : {}),
        ...(env.RESEND_FROM_EMAIL ? { RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL } : {}),
      });
      return outcome.status;
    },
    async fetchRetentionBatch(cursor, batchSize) {
      const rows = cursor
        ? await db.select().from(projects).where(gt(projects.id, cursor)).orderBy(asc(projects.id)).limit(batchSize + 1)
        : await db.select().from(projects).orderBy(asc(projects.id)).limit(batchSize + 1);
      const hasMore = rows.length > batchSize;
      const page = hasMore ? rows.slice(0, batchSize) : rows;
      return {
        items: page.map((p) => ({ id: p.id, repo: p.repo, retentionDays: p.retentionDays })),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      };
    },
    async pruneProject(repo, cutoff, dryRun) {
      if (dryRun) {
        const [oldRuns, oldDeliveries] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(runs).where(and(eq(runs.repo, repo), lt(runs.createdAt, cutoff))),
          db.select({ count: sql<number>`count(*)::int` }).from(notificationDeliveries).where(and(eq(notificationDeliveries.repo, repo), lt(notificationDeliveries.createdAt, cutoff))),
        ]);
        return { runsDeleted: oldRuns[0]?.count ?? 0, deliveriesDeleted: oldDeliveries[0]?.count ?? 0 };
      }
      const [deletedRuns, deletedDeliveries] = await Promise.all([
        db.delete(runs).where(and(eq(runs.repo, repo), lt(runs.createdAt, cutoff))).returning({ id: runs.id }),
        db.delete(notificationDeliveries).where(and(eq(notificationDeliveries.repo, repo), lt(notificationDeliveries.createdAt, cutoff))).returning({ id: notificationDeliveries.id }),
      ]);
      return { runsDeleted: deletedRuns.length, deliveriesDeleted: deletedDeliveries.length };
    },
    async recordRetentionAudit(repo, details) {
      await recordAuditLog(db as unknown as { insert(table: typeof auditLogs): { values(row: unknown): Promise<unknown> } }, {
        repo,
        actorId: 'cron-job.org',
        actorType: 'system',
        action: details.dryRun ? 'retention.dry_run' : 'retention.pruned',
        resourceType: 'project',
        resourceId: repo,
        metadata: details,
      });
    },
  };
}

export interface CronRouterOptions {
  storeFactory?: (env: CronEnv) => CronStore;
  executorsFactory?: (env: CronEnv) => CronExecutors;
  now?: () => Date;
  batchSize?: number;
}

export function createCronRouter(options: CronRouterOptions = {}) {
  const cron = new Hono<{ Bindings: CronEnv }>();

  // Strict rate limit + noindex on all internal cron routes
  cron.use('/api/v1/internal/cron/*', distributedRateLimit('cron'));
  cron.use('/api/v1/internal/cron/*', async (c, next) => {
    await next();
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  });

  // Dedicated Bearer CRON_SECRET auth (rejects user sessions and project API keys)
  cron.use('/api/v1/internal/cron/*', async (c, next) => {
    const authResult = verifyCronBearerToken(c.req.header('Authorization') ?? c.req.header('authorization'), c.env);
    if (!authResult.ok) {
      log.warn('cron_auth_failed', {
        path: new URL(c.req.url).pathname,
        reason: authResult.reason,
        ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
      });
      return new Response(
        JSON.stringify({ error: 'Unauthorized: valid CRON_SECRET Bearer token required' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="flakecheck-cron", error="invalid_token"',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        },
      );
    }
    return next();
  });

  async function acquireAndSchedule(
    c: any,
    jobType: CronJobType,
    dryRun: boolean,
    execute: (run: CronRunRecord, store: CronStore, executors: CronExecutors) => Promise<CronRunRecord>,
  ): Promise<Response> {
    const now = options.now ? options.now() : new Date();
    const periodKey = computePeriodKey(jobType, now);
    const store = options.storeFactory ? options.storeFactory(c.env) : createDrizzleCronStore(c.env.DATABASE_URL);
    const executors = options.executorsFactory ? options.executorsFactory(c.env) : createDrizzleCronExecutors(c.env);

    const existing = await store.findRun(jobType, periodKey, dryRun);
    if (existing && (existing.status === 'completed' || existing.status === 'running')) {
      return c.json(
        {
          accepted: true,
          runId: existing.id,
          jobType,
          periodKey,
          dryRun,
          status: existing.status,
          idempotentReplay: true,
        },
        202,
      );
    }

    let run: CronRunRecord;
    if (existing && existing.status === 'failed') {
      // Resume from saved cursor
      run = { ...existing, status: 'running', errorMessage: null };
      await store.updateRun(run.id, { status: 'running', errorMessage: null });
    } else {
      run = {
        id: crypto.randomUUID(),
        jobType,
        periodKey,
        status: 'running',
        dryRun,
        cursor: null,
        processedCount: 0,
        affectedCount: 0,
        errorCount: 0,
        errorMessage: null,
      };
      const created = await store.createRun(run);
      if (!created) {
        const winner = await store.findRun(jobType, periodKey, dryRun);
        return c.json(
          {
            accepted: true,
            runId: winner?.id ?? run.id,
            jobType,
            periodKey,
            dryRun,
            status: winner?.status ?? 'running',
            idempotentReplay: true,
          },
          202,
        );
      }
    }

    if (c.env.CRON_QUEUE) {
      await c.env.CRON_QUEUE.send({ runId: run.id, jobType, periodKey, dryRun });
      return c.json({ accepted: true, queued: true, runId: run.id, jobType, periodKey, dryRun, idempotentReplay: false }, 202);
    }

    const work = execute(run, store, executors);
    let scheduled = false;
    try {
      if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
        c.executionCtx.waitUntil(work);
        scheduled = true;
      }
    } catch {
      scheduled = false;
    }

    if (!scheduled) {
      const result = await work;
      return c.json(
        {
          accepted: true,
          runId: result.id,
          jobType,
          periodKey,
          dryRun,
          status: result.status,
          processedCount: result.processedCount,
          affectedCount: result.affectedCount,
          errorCount: result.errorCount,
          idempotentReplay: false,
        },
        202,
      );
    }

    return c.json({ accepted: true, runId: run.id, jobType, periodKey, dryRun, status: 'running', idempotentReplay: false }, 202);
  }

  cron.post('/api/v1/internal/cron/digest', async (c) => {
    const rawType = (c.req.query('type') ?? 'daily').toLowerCase();
    if (rawType !== 'daily' && rawType !== 'weekly') {
      return c.json({ error: 'Query parameter "type" must be "daily" or "weekly"' }, 400);
    }
    const jobType: CronJobType = rawType === 'weekly' ? 'digest_weekly' : 'digest_daily';
    const dashboardUrl = c.env.PUBLIC_APP_URL ? `${c.env.PUBLIC_APP_URL.replace(/\/+$/, '')}/app` : undefined;
    return acquireAndSchedule(c, jobType, false, (run, store, executors) =>
      runDigestJob(rawType, run, store, executors, dashboardUrl, options.batchSize),
    );
  });

  cron.post('/api/v1/internal/cron/retention', async (c) => {
    const rawDryRun = (c.req.query('dryRun') ?? 'false').toLowerCase();
    if (rawDryRun !== 'true' && rawDryRun !== 'false') {
      return c.json({ error: 'Query parameter "dryRun" must be "true" or "false"' }, 400);
    }
    const dryRun = rawDryRun === 'true';
    const now = options.now ? options.now() : new Date();
    return acquireAndSchedule(c, 'retention', dryRun, (run, store, executors) =>
      runRetentionJob(run, store, executors, now, options.batchSize),
    );
  });

  return cron;
}
