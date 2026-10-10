import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { AnalysisRPC, IngestionRPC, QuarantineRPC } from '@flakecheck/shared-kernel';
import { expiredSessionCookie, oauthAccounts, projectTokens, repositoryAccess, sessionCookie, users } from '@flakecheck/shared-kernel';
import { authenticate, canonicalRepo, digestHex } from './auth.js';
import { authenticateSession, AuthRateLimitError, completeOAuth, consumeOtp, decryptProviderToken, deleteAccount, oauthUrl, requestOtp } from './auth-engine.js';
import { dispatchWebhook } from './webhooks.js';
import { createDatabase } from './db/client.js';
import { listFlakes, testTimeline } from './db/queries.js';

type GitHubRepo = { full_name: string; private?: boolean; default_branch?: string };
const isGitHubRepo = (value: unknown): value is GitHubRepo => Boolean(value && typeof value === 'object' && typeof (value as GitHubRepo).full_name === 'string');
const isBranchObj = (value: unknown): value is { name: string } => Boolean(value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string');

export interface Env {
  DATABASE_URL: string;
  FLAKECHECK_PROJECT_TOKENS: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  PUBLIC_APP_URL?: string;
  SESSION_COOKIE_DOMAIN?: string;
  CORS_ORIGINS?: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  SERVICE_NAME?: string;
  ASSETS?: Fetcher;
  INGESTION_SERVICE: IngestionRPC & { fetch(request: Request): Promise<Response> };
  ANALYSIS_SERVICE: AnalysisRPC & { fetch(request: Request): Promise<Response> };
  QUARANTINE_SERVICE: QuarantineRPC & { fetch(request: Request): Promise<Response> };
}

function extractSessionToken(context: { req: { header(name: string): string | undefined } }): string | undefined {
  const cookieMatch = context.req.header('cookie')?.match(/(?:^|;\s*)flakecheck_session=([^;]+)/)?.[1];
  if (cookieMatch) return decodeURIComponent(cookieMatch);
  const authHeader = context.req.header('Authorization') ?? context.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return undefined;
}

export class GatewayEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env; Variables: { repo: string } }>();
    const sessionCookieFor = (token: string) => sessionCookie(token, undefined, this.env.SESSION_COOKIE_DOMAIN);
    const expiredSessionCookieFor = () => expiredSessionCookie(this.env.SESSION_COOKIE_DOMAIN);
    const dashboardUrl = (path: string) => {
      const base = this.env.PUBLIC_APP_URL?.replace(/\/+$/, '');
      return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
    };
    app.use('/api/*', cors({
      origin: (origin, context) => {
        const allowed = (context.env.CORS_ORIGINS ?? context.env.PUBLIC_APP_URL ?? '')
          .split(',')
          .map((value: string) => value.trim())
          .filter(Boolean);
        return origin && allowed.includes(origin) ? origin : '';
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-FlakeCheck-Token', 'X-FlakeCheck-Repo', 'X-FlakeCheck-Format'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }));
    app.onError((error, context) => {
      console.error('Gateway request failed', error);
      return context.json({ error: 'Something went wrong while processing your request. Please try again.' }, 500);
    });
    app.post('/api/auth/otp/request', async (context) => {
      try {
        const body = await context.req.json<{ email: string }>();
        await requestOtp(context.env, body.email);
        return context.json({ ok: true });
      } catch (error) {
        console.error('OTP request failed', error);
        if (error instanceof AuthRateLimitError) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(error.retryAfterSeconds) },
          });
        }
        return context.json({ error: 'Invalid input format' }, 400);
      }
    });
    app.post('/api/auth/otp/verify', async (context) => {
      try {
        const body = await context.req.json<{ email: string; code: string; termsAccepted?: boolean; privacyAccepted?: boolean }>();
        if (!body.termsAccepted || !body.privacyAccepted) return context.json({ error: 'Terms and Privacy Policy acceptance is required' }, 400);
        const token = await consumeOtp(context.env, body.email, body.code);
        return new Response(JSON.stringify({ ok: true, token }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(token) } });
      } catch (error) {
        console.error('OTP verification failed', error);
        if (error instanceof AuthRateLimitError) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(error.retryAfterSeconds) },
          });
        }
        return context.json({ error: 'That sign-in code is invalid or expired.' }, 401);
      }
    });
    app.get('/api/auth/me', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const db = createDatabase(context.env.DATABASE_URL);
      const [userRows, githubRows] = await Promise.all([
        db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, auth.userId)).limit(1),
        db.select({ id: oauthAccounts.id }).from(oauthAccounts).where(and(eq(oauthAccounts.userId, auth.userId), eq(oauthAccounts.provider, 'github'))).limit(1),
      ]);
      const user = userRows[0];
      return new Response(JSON.stringify({ userId: auth.userId, email: user?.email ?? null, displayName: user?.displayName ?? null, githubConnected: Boolean(githubRows[0]) }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(auth.token) } });
    });
    app.get('/api/auth/:provider', (context) => {
      const provider = context.req.param('provider');
      if (provider !== 'google' && provider !== 'github') return context.json({ error: 'Unsupported OAuth provider' }, 400);
      const state = crypto.randomUUID();
      const cookieDomain = this.env.SESSION_COOKIE_DOMAIN?.trim() ? `; Domain=${this.env.SESSION_COOKIE_DOMAIN.trim()}` : '';
      return new Response(null, { status: 302, headers: { Location: oauthUrl(provider, context.env, state), 'Set-Cookie': `flakecheck_oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax${cookieDomain}` } });
    });
    app.get('/api/github/repos', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const account = await createDatabase(context.env.DATABASE_URL).select({ accessToken: oauthAccounts.accessToken }).from(oauthAccounts).where(and(eq(oauthAccounts.userId, auth.userId), eq(oauthAccounts.provider, 'github'))).limit(1);
      if (!account[0]?.accessToken) return context.json({ error: 'Connect GitHub to choose a repository.' }, 400);
      const githubToken = await decryptProviderToken(account[0].accessToken, context.env.JWT_SECRET);
      const githubResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${githubToken}`, 'User-Agent': 'FlakeCheck' } });
      // Validate HTTP status code - don't leak internal status codes
      if (githubResponse.status !== 200) {
        // Log detailed error server-side only
        console.error('GitHub API returned non-200 status:', githubResponse.status);
        return context.json({ error: 'GitHub repositories could not be loaded.' }, 502);
      }
      // Validate content type is JSON before parsing
      const contentType = githubResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('GitHub API returned non-JSON response');
        return context.json({ error: 'GitHub repositories could not be loaded.' }, 502);
      }
      const rawData = await githubResponse.json();
      // Runtime type validation: only proceed if data matches expected schema
      if (!Array.isArray(rawData)) {
        console.error('GitHub API returned unexpected data format');
        return context.json({ error: 'GitHub repositories could not be loaded.' }, 502);
      }
      // Filter and validate only repositories with required fields
      const validRepos = rawData.filter(isGitHubRepo) as GitHubRepo[];
      // Return only the fields needed by the frontend
      return context.json({ repos: validRepos.map((repo) => ({ fullName: repo.full_name, visibility: repo.private ? 'private' : 'public', defaultBranch: repo.default_branch })) });
    });
    app.get('/api/github/repos/:owner/:name/branches', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const account = await createDatabase(context.env.DATABASE_URL).select({ accessToken: oauthAccounts.accessToken }).from(oauthAccounts).where(and(eq(oauthAccounts.userId, auth.userId), eq(oauthAccounts.provider, 'github'))).limit(1);
      if (!account[0]?.accessToken) return context.json({ error: 'Connect GitHub to choose a repository.' }, 400);
      const githubToken = await decryptProviderToken(account[0].accessToken, context.env.JWT_SECRET);
      const githubResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(context.req.param('owner'))}/${encodeURIComponent(context.req.param('name'))}/branches?per_page=100`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${githubToken}`, 'User-Agent': 'FlakeCheck' } });
      // Validate HTTP status code - don't leak internal status codes
      if (githubResponse.status !== 200) {
        console.error('GitHub API returned non-200 status for branches:', githubResponse.status);
        return context.json({ error: 'GitHub branches could not be loaded.' }, 502);
      }
      // Validate content type is JSON before parsing
      const contentType = githubResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('GitHub API returned non-JSON response for branches');
        return context.json({ error: 'GitHub branches could not be loaded.' }, 502);
      }
      const rawData = await githubResponse.json();
      // Runtime type validation: only proceed if data matches expected schema
      if (!Array.isArray(rawData)) {
        console.error('GitHub API returned unexpected data format for branches');
        return context.json({ error: 'GitHub branches could not be loaded.' }, 502);
      }
      // Filter and validate only branches with required fields
      const validBranches = rawData.filter(isBranchObj) as Array<{ name: string }>;
      // Return only the field needed by the frontend
      return context.json({ branches: validBranches.map((branch) => branch.name) });
    });
    app.get('/api/auth/:provider/callback', async (context) => {
      const provider = context.req.param('provider');
      if (provider !== 'google' && provider !== 'github') return context.json({ error: 'Unsupported OAuth provider' }, 400);
      const code = context.req.query('code');
      const state = context.req.query('state');
      const storedState = context.req.header('cookie')?.match(/(?:^|;\s*)flakecheck_oauth_state=([^;]+)/)?.[1];
      if (!code || !state || !storedState || state !== decodeURIComponent(storedState)) return context.json({ error: 'Invalid OAuth state' }, 400);
      try {
        const token = await completeOAuth(context.env, provider, code);
        return new Response(null, { status: 302, headers: { Location: dashboardUrl(`/dashboard?session=${encodeURIComponent(token)}`), 'Set-Cookie': sessionCookieFor(token) } });
      } catch (error) {
        console.error('OAuth callback failed', error);
        return context.json({ error: 'We could not complete sign-in with that provider.' }, 401);
      }
    });
    app.post('/api/auth/logout', (context) => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': expiredSessionCookieFor() } }));
    app.patch('/api/account/profile', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const body = await context.req.json<{ displayName?: string; locale?: string }>();
      const displayName = body.displayName?.trim().slice(0, 120) || null;
      const locale = body.locale === 'tr' ? 'tr' : 'en';
      await createDatabase(context.env.DATABASE_URL).update(users).set({ displayName, locale }).where(eq(users.id, auth.userId));
      return context.json({ ok: true, displayName, locale });
    });
    app.get('/api/account/repositories', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const rows = await createDatabase(context.env.DATABASE_URL)
        .select({ repo: repositoryAccess.repo })
        .from(repositoryAccess)
        .where(eq(repositoryAccess.userId, auth.userId))
        .orderBy(desc(repositoryAccess.grantedAt));
      return context.json({ repositories: rows.map((row) => row.repo) });
    });
    app.get('/api/account/repository-token', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const repo = canonicalRepo(context.req.query('repo'));
      if (!repo) return context.json({ error: 'A repository in owner/name format is required.' }, 400);
      const rows = await createDatabase(context.env.DATABASE_URL)
        .select({ id: projectTokens.id })
        .from(projectTokens)
        .where(and(eq(projectTokens.repo, repo), eq(projectTokens.createdBy, auth.userId), isNull(projectTokens.revokedAt)))
        .limit(1);
      return context.json({ configured: Boolean(rows[0]) });
    });
    app.post('/api/account/repository-token', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return context.json({ error: 'Authentication required' }, 401);
      const body = await context.req.json<{ repo?: string }>();
      const repo = canonicalRepo(body.repo);
      if (!repo) return context.json({ error: 'A repository in owner/name format is required.' }, 400);
      const rawToken = `fc_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
      const db = createDatabase(context.env.DATABASE_URL);
      await db.update(projectTokens).set({ revokedAt: new Date() }).where(and(eq(projectTokens.repo, repo), eq(projectTokens.createdBy, auth.userId), isNull(projectTokens.revokedAt)));
      await db.insert(projectTokens).values({ id: crypto.randomUUID(), repo, tokenDigest: await digestHex(rawToken), createdBy: auth.userId });
      return context.json({ repo, token: rawToken });
    });
    app.get('/api/legal/:document', (context) => {
      const document = context.req.param('document');
      if (!['terms', 'privacy'].includes(document)) return context.json({ error: 'Document not found' }, 404);
      return context.json({ document, version: '1.0', language: context.req.header('accept-language')?.startsWith('tr') ? 'tr' : 'en' });
    });
    app.use('/api/*', async (context, next) => {
      if (context.req.path.startsWith('/api/auth/') || context.req.path.startsWith('/api/legal/') || context.req.path.startsWith('/api/account/') || context.req.path.startsWith('/api/github/') || context.req.path === '/api/health' || context.req.path === '/health') return next();
      try {
        const url = new URL(context.req.url);
        const body = context.req.method === 'GET' ? undefined : await context.req.raw.clone().json().catch(() => undefined) as Record<string, unknown> | undefined;
        const repo = String(body?.repo ?? url.searchParams.get('repo') ?? context.req.header('x-flakecheck-repo') ?? '');
        let auth;
        const sessionToken = extractSessionToken(context);
        const session = await authenticateSession(context.env, sessionToken);
        let githubAccessToken: string | undefined;
        if (session) {
          const githubAccount = await createDatabase(context.env.DATABASE_URL).select({ accessToken: oauthAccounts.accessToken }).from(oauthAccounts).where(and(eq(oauthAccounts.userId, session.userId), eq(oauthAccounts.provider, 'github'))).limit(1);
          if (githubAccount[0]?.accessToken) {
            try {
              githubAccessToken = await decryptProviderToken(githubAccount[0].accessToken, context.env.JWT_SECRET);
            } catch {
              githubAccessToken = undefined;
            }
          }
        }
        try {
          auth = await authenticate(repo, context.req.header('X-FlakeCheck-Token'), context.env, githubAccessToken);
        } catch (error) {
          const suppliedToken = context.req.header('X-FlakeCheck-Token');
          const canonical = canonicalRepo(repo);
          if (!canonical) throw error;
          const matches = suppliedToken
            ? await createDatabase(context.env.DATABASE_URL).select({ id: projectTokens.id }).from(projectTokens).where(and(eq(projectTokens.repo, canonical), eq(projectTokens.tokenDigest, await digestHex(suppliedToken)), isNull(projectTokens.revokedAt))).limit(1)
            : [];
          if (!matches[0]) {
            if (!session) throw error;
            const access = await createDatabase(context.env.DATABASE_URL).select({ id: repositoryAccess.id }).from(repositoryAccess).where(and(eq(repositoryAccess.userId, session.userId), eq(repositoryAccess.repo, canonical))).limit(1);
            if (!access[0]) throw error;
            auth = { repo: canonical };
          } else {
            auth = { repo: canonical };
          }
        }
        if (session && auth) {
          await createDatabase(context.env.DATABASE_URL).insert(repositoryAccess).values({ id: crypto.randomUUID(), userId: session.userId, repo: auth.repo }).onConflictDoNothing();
        }
        context.set('repo', auth.repo);
        await next();
      } catch (error) {
        console.warn('Repository authentication rejected', error instanceof Error ? error.message : 'unknown reason');
        return context.json({ error: 'We could not verify this repository connection.' }, 401);
      }
    });
    app.post('/api/ingest', async (context) => {
      const format = context.req.header('x-flakecheck-format');
      if (!format || !context.req.raw.body) return context.json({ error: 'x-flakecheck-format and request body are required' }, 400);
      const repo = context.get('repo');
      const metadata: Record<string, string> & { repo: string } = { repo };
      context.req.raw.headers.forEach((value, key) => {
        if (key.startsWith('x-flakecheck-')) metadata[key.slice('x-flakecheck-'.length).replaceAll('-', '_')] = value;
      });
      return context.json(await this.env.INGESTION_SERVICE.ingestStream(format, metadata, context.req.raw.body), 201);
    });
    app.post('/api/analyze', async (context) => {
      const body = await context.req.json<{ runId: string; windowSize?: number }>();
      const result = await this.env.ANALYSIS_SERVICE.analyzeRun(context.get('repo'), body.runId, body.windowSize ? { windowSize: body.windowSize } : undefined);
      if (result.flakesFound > 0 && (context.env.SLACK_WEBHOOK_URL || context.env.DISCORD_WEBHOOK_URL)) {
        const webhookConfig = {
          ...(context.env.SLACK_WEBHOOK_URL ? { slackUrl: context.env.SLACK_WEBHOOK_URL } : {}),
          ...(context.env.DISCORD_WEBHOOK_URL ? { discordUrl: context.env.DISCORD_WEBHOOK_URL } : {}),
          ...(context.env.PUBLIC_APP_URL ? { dashboardUrl: context.env.PUBLIC_APP_URL } : {}),
        };
        await dispatchWebhook('PROVEN_FLAKE_DETECTED', context.get('repo'), { ...result }, webhookConfig);
      }
      return context.json(result);
    });
    app.get('/api/summary', async (context) => context.json(await this.env.ANALYSIS_SERVICE.calculateSummary(context.get('repo'))));
    app.get('/api/flakes', async (context) => {
      const page = Math.max(1, Number(context.req.query('page') ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(context.req.query('pageSize') ?? 25)));
      return context.json({ page, pageSize, items: await listFlakes(createDatabase(context.env.DATABASE_URL), context.get('repo'), page, pageSize) });
    });
    app.get('/api/tests/:id', async (context) => context.json({ testId: context.req.param('id'), timeline: await testTimeline(createDatabase(context.env.DATABASE_URL), context.get('repo'), context.req.param('id')) }));
    app.post('/api/quarantine', async (context) => {
      const body = await context.req.json<{ testId: string; state: boolean; reason?: string }>();
      await this.env.QUARANTINE_SERVICE.setQuarantine(context.get('repo'), body.testId, body.state, body.reason);
      return context.json({ ok: true });
    });
    const healthCheckHandler = async (context: any) => {
      const runCheck = async (name: string, checkFn: () => Promise<unknown>) => {
        const start = Date.now();
        try {
          const res = await checkFn();
          if (res instanceof Response && !res.ok) {
            return { name, status: 'error', durationMs: Date.now() - start, error: `HTTP ${res.status}` };
          }
          return { name, status: 'ok', durationMs: Date.now() - start };
        } catch (error) {
          return { name, status: 'error', durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
        }
      };

      const [ingestion, analysis, quarantine, database] = await Promise.all([
        runCheck('Ingestion Service', () => this.env.INGESTION_SERVICE.fetch(new Request('https://internal/health'))),
        runCheck('Analysis Service', () => this.env.ANALYSIS_SERVICE.fetch(new Request('https://internal/health'))),
        runCheck('Quarantine Service', () => this.env.QUARANTINE_SERVICE.fetch(new Request('https://internal/health'))),
        runCheck('Neon Database (PostgreSQL)', () => createDatabase(context.env.DATABASE_URL).execute('select 1')),
      ]);

      const services = [ingestion, analysis, quarantine, database];
      const isOk = services.every((s) => s.status === 'ok');

      return context.json({
        status: isOk ? 'ok' : 'degraded',
        gateway: 'ok',
        services,
        checks: services.map((s) => s.status === 'ok' ? 'fulfilled' : 'rejected'),
      });
    };
    app.get('/api/health', healthCheckHandler);
    app.get('/health', healthCheckHandler);
    app.delete('/api/account/delete', async (context) => {
      const token = extractSessionToken(context);
      const auth = await authenticateSession(context.env, token);
      if (!auth) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      await deleteAccount(context.env, auth.userId);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': expiredSessionCookieFor() } });
    });
    const response = await app.fetch(request, this.env);
    if (response.status !== 404 || !this.env.ASSETS) return response;
    return this.env.ASSETS.fetch(request);
  }
}

export default GatewayEntrypoint;
