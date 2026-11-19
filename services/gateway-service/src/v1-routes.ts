import { Hono } from 'hono';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  auditLogs,
  classifications,
  ingestIdempotency,
  issueTrackerConfigs,
  notificationPreferences,
  organizationMembers,
  organizations,
  projects,
  projectTokens,
  quarantineHistory,
  quarantinePolicies,
  runs,
  tests,
  trackedIssues,
  users,
  createLogger,
  hasRoleAtLeast,
  isValidRole,
  withRetry,
} from '@flakecheck/shared-kernel';
import type { AnalysisRPC, IngestionRPC, QuarantineRPC } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';
import { authenticate, canonicalRepo, digestHex } from './auth.js';
import { authenticateSession } from './auth-engine.js';
import { renderBadgeMarkdown, renderFlakeBadgeSvg } from './badge.js';
import { buildOpenApiSpec, renderInteractiveApiDocsHtml } from './openapi.js';
import {
  ApiKeyCreateSchema,
  CiWebhookSchema,
  IssueTrackerConfigSchema,
  NotificationPreferenceSchema,
  OrganizationCreateSchema,
  QuarantinePolicySchema,
  recordAuditLog,
  verifyWebhookRequest,
} from './security.js';
import { distributedRateLimit } from './rate-limit.js';
import { openTrackerIssue, postGitHubPrComment, setGitHubCommitStatus } from './integrations.js';

export interface V1Env {
  DATABASE_URL: string;
  FLAKECHECK_PROJECT_TOKENS: string;
  JWT_SECRET: string;
  PUBLIC_APP_URL?: string;
  CI_WEBHOOK_SECRET?: string;
  GITHUB_TOKEN?: string;
  INGESTION_SERVICE: IngestionRPC & { fetch(request: Request): Promise<Response> };
  ANALYSIS_SERVICE: AnalysisRPC & { fetch(request: Request): Promise<Response> };
  QUARANTINE_SERVICE: QuarantineRPC & { fetch(request: Request): Promise<Response> };
  ANALYSIS_QUEUE?: { send(message: unknown): Promise<void> };
}

function getBaseUrl(env: V1Env, reqUrl: string): string {
  if (env.PUBLIC_APP_URL) return env.PUBLIC_APP_URL.replace(/\/+$/, '');
  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

function extractSessionToken(c: { req: { header(name: string): string | undefined } }): string | undefined {
  const cookieMatch = c.req.header('cookie')?.match(/(?:^|;\s*)flakecheck_session=([^;]+)/)?.[1];
  if (cookieMatch) return decodeURIComponent(cookieMatch);
  const auth = c.req.header('Authorization') ?? c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return undefined;
}

export function createV1Router() {
  const v1 = new Hono<{ Bindings: V1Env }>();
  const log = createLogger('gateway-v1');

  // 1. OpenAPI 3.1 Schema & Interactive Docs
  v1.get('/api/v1/openapi.json', (c) => {
    return c.json(buildOpenApiSpec(getBaseUrl(c.env, c.req.url)));
  });

  v1.get('/docs/api', (c) => {
    return c.html(renderInteractiveApiDocsHtml(getBaseUrl(c.env, c.req.url)));
  });

  // 2. Readiness Probe (/ready & /api/v1/ready)
  const readyHandler = async (c: { env: V1Env; json: (data: unknown, status?: 200 | 503) => Response }) => {
    const start = Date.now();
    try {
      const db = createDatabase(c.env.DATABASE_URL);
      await withRetry(() => db.execute(sql`select 1`), { maxAttempts: 2, timeoutMs: 3000 });
      return c.json({ status: 'ready', database: 'ok', durationMs: Date.now() - start }, 200);
    } catch (error) {
      log.error('readiness_check_failed', { error });
      return c.json({ status: 'not_ready', database: 'error', durationMs: Date.now() - start }, 503);
    }
  };
  v1.get('/ready', readyHandler);
  v1.get('/api/v1/ready', readyHandler);

  // 3. Public / Private SVG README Badge Endpoint
  v1.get('/api/v1/badge/:owner/:repoSvg', distributedRateLimit('badge'), async (c) => {
    const owner = c.req.param('owner');
    const repoName = c.req.param('repoSvg').replace(/\.svg$/i, '');
    const repo = canonicalRepo(`${owner}/${repoName}`);
    if (!repo) return c.text('Invalid repository', 400);

    let healthScore = 100;
    let activeFlakes = 0;
    try {
      const summary = await c.env.ANALYSIS_SERVICE.calculateSummary(repo);
      healthScore = summary.healthScore ?? 100;
      activeFlakes = summary.activeFlakes ?? 0;
    } catch {
      // Fall back to neutral healthy badge when repo has no runs yet
    }

    const svg = renderFlakeBadgeSvg({ repo, healthScore, activeFlakes });
    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  });

  // Helper to authorize repo-scoped requests (session OR project token, with automatic repo inference from token/body)
  async function requireRepoAuth(c: any): Promise<{ repo: string; actorId: string; actorType: 'user' | 'token' } | Response> {
    let rawRepo = c.req.query('repo') ?? c.req.header('X-FlakeCheck-Repo') ?? '';
    if (!rawRepo && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const clonedBody = (await c.req.raw.clone().json().catch(() => null)) as { repo?: unknown } | null;
      if (typeof clonedBody?.repo === 'string') {
        rawRepo = clonedBody.repo;
      }
    }
    let repo = canonicalRepo(rawRepo);
    const projectToken = c.req.header('X-FlakeCheck-Token')?.trim();

    // Check database project_tokens table when X-FlakeCheck-Token is supplied
    if (projectToken && c.env.DATABASE_URL && c.env.DATABASE_URL !== 'https://example.invalid') {
      try {
        const db = createDatabase(c.env.DATABASE_URL);
        const tokenDigest = await digestHex(projectToken);
        const rows = await db
          .select({ id: projectTokens.id, repo: projectTokens.repo, expiresAt: projectTokens.expiresAt, revokedAt: projectTokens.revokedAt })
          .from(projectTokens)
          .where(eq(projectTokens.tokenDigest, tokenDigest))
          .limit(1);
        const row = rows[0];
        if (row && !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now())) {
          const tokenRepo = canonicalRepo(row.repo);
          if (!repo && tokenRepo) {
            repo = tokenRepo;
          }
          if (repo && tokenRepo === repo) {
            return { repo, actorId: row.id, actorType: 'token' };
          }
        }
      } catch {
        // Fall through to session or env token check
      }
    }

    if (!repo) {
      return c.json(
        { error: 'Valid repository (owner/name) is required via X-FlakeCheck-Repo header, ?repo= query parameter, or a repository-scoped X-FlakeCheck-Token' },
        400,
      );
    }

    const session = await authenticateSession(c.env, extractSessionToken(c));
    if (session) {
      return { repo, actorId: session.userId, actorType: 'user' };
    }

    try {
      const auth = await authenticate(repo, projectToken, c.env);
      return { repo: auth.repo, actorId: 'project-token', actorType: 'token' };
    } catch {
      return c.json({ error: 'Authentication required' }, 401);
    }
  }

  // 4. Analytics Overview (Trends, Top 10 Flakiest Tests, CI Cost, Team Breakdown, Badge Markdown)
  v1.get('/api/v1/analytics/overview', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;

    const db = createDatabase(c.env.DATABASE_URL);
    const [summary, topFlakesRows, recentRunsRows, projectRow] = await Promise.all([
      c.env.ANALYSIS_SERVICE.calculateSummary(auth.repo),
      db
        .select({
          testId: classifications.testId,
          testName: tests.testName,
          filePath: tests.filePath,
          category: classifications.category,
          flakinessScore: classifications.flakinessScore,
          flipRateBps: classifications.flipRateBps,
          sampleSize: classifications.sampleSize,
          rootCause: classifications.rootCause,
          remediation: classifications.remediation,
          isQuarantined: tests.isQuarantined,
        })
        .from(classifications)
        .innerJoin(tests, eq(classifications.testId, tests.id))
        .where(eq(tests.repo, auth.repo))
        .orderBy(desc(classifications.flakinessScore), desc(classifications.calculatedAt))
        .limit(10),
      db
        .select({
          id: runs.id,
          branch: runs.branch,
          durationMs: runs.durationMs,
          setupDurationMs: runs.setupDurationMs,
          createdAt: runs.createdAt,
        })
        .from(runs)
        .where(eq(runs.repo, auth.repo))
        .orderBy(desc(runs.createdAt))
        .limit(30),
      db.select().from(projects).where(eq(projects.repo, auth.repo)).limit(1),
    ]);

    const baseUrl = getBaseUrl(c.env, c.req.url);
    return c.json({
      repo: auth.repo,
      team: projectRow[0]?.team ?? 'core',
      summary,
      topFlakiestTests: topFlakesRows,
      trend: recentRunsRows.reverse().map((r) => ({
        runId: r.id,
        branch: r.branch,
        durationSeconds: Math.round((r.durationMs + r.setupDurationMs) / 1000),
        createdAt: r.createdAt,
      })),
      badgeMarkdown: renderBadgeMarkdown(baseUrl, auth.repo),
    });
  });

  // 5. Quarantine Policy & History
  v1.get('/api/v1/quarantine/policy', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const db = createDatabase(c.env.DATABASE_URL);
    const rows = await db.select().from(quarantinePolicies).where(eq(quarantinePolicies.repo, auth.repo)).limit(1);
    return c.json(rows[0] ?? {
      repo: auth.repo,
      enabled: true,
      flakinessScoreThreshold: 60,
      minFlipCount: 2,
      minSampleSize: 5,
      autoGraduatePasses: 10,
      nonBlockingMode: true,
    });
  });

  v1.put('/api/v1/quarantine/policy', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const rawBody = await c.req.json().catch(() => ({}));
    const parsed = QuarantinePolicySchema.safeParse(rawBody && typeof rawBody === 'object' ? rawBody : {});
    if (!parsed.success) return c.json({ error: 'Invalid policy payload', details: parsed.error.flatten() }, 400);

    const db = createDatabase(c.env.DATABASE_URL);
    const now = new Date();
    const existing = await db.select().from(quarantinePolicies).where(eq(quarantinePolicies.repo, auth.repo)).limit(1);
    if (existing[0]) {
      await db.update(quarantinePolicies).set({ ...parsed.data, updatedAt: now }).where(eq(quarantinePolicies.repo, auth.repo));
    } else {
      await db.insert(quarantinePolicies).values({ id: crypto.randomUUID(), repo: auth.repo, ...parsed.data, updatedAt: now });
    }
    await recordAuditLog(db, {
      repo: auth.repo,
      actorId: auth.actorId,
      actorType: auth.actorType,
      action: 'quarantine_policy.updated',
      resourceType: 'quarantine_policy',
      resourceId: auth.repo,
      metadata: parsed.data,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
    });
    return c.json({ ok: true, repo: auth.repo, ...parsed.data });
  });

  v1.get('/api/v1/quarantine/history', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const db = createDatabase(c.env.DATABASE_URL);
    const items = await db
      .select()
      .from(quarantineHistory)
      .where(eq(quarantineHistory.repo, auth.repo))
      .orderBy(desc(quarantineHistory.createdAt))
      .limit(100);
    return c.json({ repo: auth.repo, items });
  });

  // 6. Notification Preferences
  v1.get('/api/v1/notifications/preferences', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const db = createDatabase(c.env.DATABASE_URL);
    const items = await db
      .select({
        id: notificationPreferences.id,
        repo: notificationPreferences.repo,
        channel: notificationPreferences.channel,
        target: notificationPreferences.target,
        events: notificationPreferences.events,
        digestFrequency: notificationPreferences.digestFrequency,
        dedupWindowMinutes: notificationPreferences.dedupWindowMinutes,
        rateLimitPerHour: notificationPreferences.rateLimitPerHour,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.repo, auth.repo));
    return c.json({ repo: auth.repo, items });
  });

  v1.post('/api/v1/notifications/preferences', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const parsed = NotificationPreferenceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid notification preference', details: parsed.error.flatten() }, 400);

    const db = createDatabase(c.env.DATABASE_URL);
    const id = crypto.randomUUID();
    await db.insert(notificationPreferences).values({
      id,
      repo: auth.repo,
      userId: auth.actorType === 'user' ? auth.actorId : null,
      channel: parsed.data.channel,
      target: parsed.data.target,
      signingSecret: parsed.data.signingSecret ?? null,
      events: parsed.data.events,
      digestFrequency: parsed.data.digestFrequency,
      dedupWindowMinutes: parsed.data.dedupWindowMinutes,
      rateLimitPerHour: parsed.data.rateLimitPerHour,
      enabled: parsed.data.enabled,
    });
    await recordAuditLog(db, {
      repo: auth.repo,
      actorId: auth.actorId,
      actorType: auth.actorType,
      action: 'notification_preference.created',
      resourceType: 'notification_preference',
      resourceId: id,
      metadata: { channel: parsed.data.channel, digestFrequency: parsed.data.digestFrequency },
    });
    return c.json({ ok: true, id }, 201);
  });

  // 7. Multi-Tenancy: Organizations, Scoped API Keys, Audit Logs
  v1.get('/api/v1/organizations', async (c) => {
    const session = await authenticateSession(c.env, extractSessionToken(c));
    if (!session) return c.json({ error: 'Authentication required' }, 401);
    const db = createDatabase(c.env.DATABASE_URL);
    const rows = await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
      .where(eq(organizationMembers.userId, session.userId));
    return c.json({ items: rows });
  });

  v1.post('/api/v1/organizations', async (c) => {
    const session = await authenticateSession(c.env, extractSessionToken(c));
    if (!session) return c.json({ error: 'Authentication required' }, 401);
    const parsed = OrganizationCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid organization input', details: parsed.error.flatten() }, 400);

    const db = createDatabase(c.env.DATABASE_URL);
    const orgId = crypto.randomUUID();
    await db.insert(organizations).values({ id: orgId, slug: parsed.data.slug, name: parsed.data.name, createdBy: session.userId });
    await db.insert(organizationMembers).values({ id: crypto.randomUUID(), orgId, userId: session.userId, role: 'owner' });
    await recordAuditLog(db, {
      orgId,
      actorId: session.userId,
      actorType: 'user',
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: { slug: parsed.data.slug },
    });
    return c.json({ ok: true, id: orgId, slug: parsed.data.slug, name: parsed.data.name, role: 'owner' }, 201);
  });

  v1.post('/api/v1/tokens', async (c) => {
    const session = await authenticateSession(c.env, extractSessionToken(c));
    if (!session) return c.json({ error: 'Authentication required' }, 401);
    const parsed = ApiKeyCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid API key payload', details: parsed.error.flatten() }, 400);

    const rawBytes = new Uint8Array(24);
    crypto.getRandomValues(rawBytes);
    const rawToken = `fc_${[...rawBytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const digest = await digestHex(rawToken);
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : null;

    const db = createDatabase(c.env.DATABASE_URL);
    const id = crypto.randomUUID();
    await db.insert(projectTokens).values({
      id,
      repo: parsed.data.repo,
      name: parsed.data.name,
      tokenDigest: digest,
      scopes: parsed.data.scopes,
      createdBy: session.userId,
      expiresAt,
    });
    await recordAuditLog(db, {
      repo: parsed.data.repo,
      actorId: session.userId,
      actorType: 'user',
      action: 'api_key.created',
      resourceType: 'project_token',
      resourceId: id,
      metadata: { name: parsed.data.name, scopes: parsed.data.scopes, expiresAt },
    });
    return c.json({ id, repo: parsed.data.repo, name: parsed.data.name, scopes: parsed.data.scopes, expiresAt, token: rawToken }, 201);
  });

  v1.get('/api/v1/audit-logs', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const db = createDatabase(c.env.DATABASE_URL);
    const items = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.repo, auth.repo))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    return c.json({ repo: auth.repo, items });
  });

  // 8. Issue Tracker Configurations & Sync (GitHub Issues, Jira, Linear)
  v1.get('/api/v1/issue-trackers', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const db = createDatabase(c.env.DATABASE_URL);
    const configs = await db
      .select({ id: issueTrackerConfigs.id, provider: issueTrackerConfigs.provider, enabled: issueTrackerConfigs.enabled, updatedAt: issueTrackerConfigs.updatedAt })
      .from(issueTrackerConfigs)
      .where(eq(issueTrackerConfigs.repo, auth.repo));
    const issues = await db
      .select()
      .from(trackedIssues)
      .where(eq(trackedIssues.repo, auth.repo))
      .orderBy(desc(trackedIssues.createdAt))
      .limit(50);
    return c.json({ repo: auth.repo, configs, trackedIssues: issues });
  });

  v1.put('/api/v1/issue-trackers', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const parsed = IssueTrackerConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid issue tracker configuration', details: parsed.error.flatten() }, 400);

    const db = createDatabase(c.env.DATABASE_URL);
    const now = new Date();
    const existing = await db
      .select()
      .from(issueTrackerConfigs)
      .where(and(eq(issueTrackerConfigs.repo, auth.repo), eq(issueTrackerConfigs.provider, parsed.data.provider)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(issueTrackerConfigs)
        .set({ config: parsed.data.config, enabled: parsed.data.enabled, updatedAt: now })
        .where(eq(issueTrackerConfigs.id, existing[0].id));
    } else {
      await db.insert(issueTrackerConfigs).values({
        id: crypto.randomUUID(),
        repo: auth.repo,
        provider: parsed.data.provider,
        config: parsed.data.config,
        enabled: parsed.data.enabled,
        updatedAt: now,
      });
    }
    return c.json({ ok: true, repo: auth.repo, provider: parsed.data.provider });
  });

  v1.post('/api/v1/issue-trackers/sync', async (c) => {
    const auth = await requireRepoAuth(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json<{ testId: string; testName: string; filePath: string; flakinessScore: number; rootCause: string; remediation: string }>().catch(() => null);
    if (!body?.testId || !body?.testName) return c.json({ error: 'testId and testName are required' }, 400);

    const db = createDatabase(c.env.DATABASE_URL);
    const configs = await db
      .select()
      .from(issueTrackerConfigs)
      .where(and(eq(issueTrackerConfigs.repo, auth.repo), eq(issueTrackerConfigs.enabled, true)));

    const created = [];
    for (const cfg of configs) {
      const provider = cfg.provider as 'github' | 'jira' | 'linear';
      const issue = await openTrackerIssue(provider, cfg.config, {
        repo: auth.repo,
        testId: body.testId,
        testName: body.testName,
        filePath: body.filePath ?? 'unknown',
        flakinessScore: body.flakinessScore ?? 80,
        rootCause: body.rootCause ?? 'unknown',
        remediation: body.remediation ?? 'Inspect failure logs in FlakeCheck.',
        dashboardUrl: `${getBaseUrl(c.env, c.req.url)}/app`,
      });
      await db.insert(trackedIssues).values({
        id: crypto.randomUUID(),
        repo: auth.repo,
        testId: body.testId,
        provider,
        externalIssueId: issue.externalIssueId,
        externalIssueUrl: issue.externalIssueUrl,
        status: 'open',
      }).onConflictDoNothing();
      created.push(issue);
    }
    return c.json({ ok: true, created });
  });

  // 9. Authenticated & Idempotent CI Webhook Ingestion + GitHub PR Comment & Commit Status
  v1.post('/api/v1/webhooks/ci', distributedRateLimit('ingest'), async (c) => {
    const rawBody = await c.req.text();
    const sigHeader = c.req.header('X-FlakeCheck-Signature') ?? c.req.header('X-Hub-Signature-256') ?? '';
    const tsHeader = c.req.header('X-FlakeCheck-Timestamp') ?? c.req.header('X-Webhook-Timestamp');
    if (c.env.CI_WEBHOOK_SECRET) {
      const check = await verifyWebhookRequest({
        secret: c.env.CI_WEBHOOK_SECRET,
        rawBody,
        signatureHeader: sigHeader,
        timestampHeader: tsHeader,
      });
      if (!check.valid) return c.json({ error: check.reason ?? 'Invalid webhook signature' }, 401);
    }

    let jsonBody: unknown;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }
    const parsed = CiWebhookSchema.safeParse(jsonBody);
    if (!parsed.success) return c.json({ error: 'Invalid CI webhook payload', details: parsed.error.flatten() }, 400);

    const idempotencyKey = c.req.header('Idempotency-Key')?.trim();
    const db = createDatabase(c.env.DATABASE_URL);
    if (idempotencyKey) {
      const cached = await db.select().from(ingestIdempotency).where(eq(ingestIdempotency.idempotencyKey, idempotencyKey)).limit(1);
      if (cached[0]) {
        return c.json({ ...(cached[0].response as Record<string, unknown>), idempotentReplay: true });
      }
    }

    const bytes = new TextEncoder().encode(parsed.data.report);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

    const ingested = await c.env.INGESTION_SERVICE.ingestStream(parsed.data.format, {
      repo: parsed.data.repo,
      branch: parsed.data.branch,
      commit_sha: parsed.data.commitSha,
      ci_workflow_name: `${parsed.data.provider}-webhook`,
    }, stream);

    if (c.env.ANALYSIS_QUEUE) {
      await c.env.ANALYSIS_QUEUE.send({ type: 'analyze_run', repo: parsed.data.repo, runId: ingested.runId });
    }
    const analysis = await c.env.ANALYSIS_SERVICE.analyzeRun(parsed.data.repo, ingested.runId);
    const summary = await c.env.ANALYSIS_SERVICE.calculateSummary(parsed.data.repo);

    // Optional GitHub PR comment & commit status check when GITHUB_TOKEN is configured
    let prCommentUrl: string | null = null;
    if (c.env.GITHUB_TOKEN && parsed.data.provider === 'github') {
      const dashUrl = `${getBaseUrl(c.env, c.req.url)}/app`;
      await setGitHubCommitStatus(parsed.data.repo, parsed.data.commitSha, c.env.GITHUB_TOKEN, {
        state: summary.activeFlakes > 0 ? 'failure' : 'success',
        description: `Health ${summary.healthScore}% · ${summary.activeFlakes} active flaky tests`,
        targetUrl: dashUrl,
      }).catch((err) => log.warn('github_status_failed', { error: err }));

      if (parsed.data.prNumber) {
        const res = await postGitHubPrComment(parsed.data.repo, parsed.data.prNumber, c.env.GITHUB_TOKEN, {
          repo: parsed.data.repo,
          commitSha: parsed.data.commitSha,
          healthScore: summary.healthScore,
          activeFlakes: summary.activeFlakes,
          quarantinedCount: 0,
          wasteMinutes: summary.wasteSeconds / 60,
          wasteUsd: summary.wasteUsd,
          dashboardUrl: dashUrl,
          topFlakes: [],
        }).catch(() => null);
        prCommentUrl = res?.commentUrl ?? null;
      }
    }

    const responsePayload = { ok: true, ...ingested, analysis, prCommentUrl };
    if (idempotencyKey) {
      await db.insert(ingestIdempotency).values({
        idempotencyKey,
        repo: parsed.data.repo,
        runId: ingested.runId,
        response: responsePayload,
      }).onConflictDoNothing();
    }
    return c.json(responsePayload);
  });

  // 10. GDPR / KVKK Portable Account Data Export
  v1.get('/api/v1/account/export', async (c) => {
    const session = await authenticateSession(c.env, extractSessionToken(c));
    if (!session) return c.json({ error: 'Authentication required' }, 401);
    const db = createDatabase(c.env.DATABASE_URL);
    const [userRow, memberships, logs] = await Promise.all([
      db.select({ id: users.id, email: users.email, displayName: users.displayName, locale: users.locale, createdAt: users.createdAt }).from(users).where(eq(users.id, session.userId)).limit(1),
      db.select().from(organizationMembers).where(eq(organizationMembers.userId, session.userId)),
      db.select().from(auditLogs).where(eq(auditLogs.actorId, session.userId)).orderBy(desc(auditLogs.createdAt)).limit(200),
    ]);
    return c.json({
      exportedAt: new Date().toISOString(),
      compliance: ['GDPR', 'KVKK'],
      user: userRow[0] ?? null,
      organizations: memberships,
      auditLogs: logs,
    });
  });

  // Guard helper export reference check
  void isValidRole;
  void hasRoleAtLeast;
  void gte;

  return v1;
}
