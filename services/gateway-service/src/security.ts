import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { auditLogs } from '@flakecheck/shared-kernel';

// ---------------------------------------------------------------------------
// 1. Security Headers Middleware (CSP, HSTS, X-Frame-Options, etc.)
// ---------------------------------------------------------------------------
export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const headers = c.res.headers;
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    if (!headers.has('Content-Security-Policy')) {
      headers.set(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https://api.github.com https://flakecheck.onurd.com.tr",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      );
    }
  };
}

// ---------------------------------------------------------------------------
// 2. Sliding-Window Rate Limiter (Workers isolate memory, configurable)
// ---------------------------------------------------------------------------
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimitMiddleware(options: { windowMs?: number; maxRequests?: number } = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 120;

  return async (c, next) => {
    const key =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
      c.req.header('X-FlakeCheck-Token')?.slice(0, 12) ??
      'anonymous';

    const now = Date.now();
    const existing = buckets.get(key);
    let bucket: Bucket;
    if (!existing || existing.resetAt <= now) {
      bucket = { count: 1, resetAt: now + windowMs };
      buckets.set(key, bucket);
    } else {
      existing.count += 1;
      bucket = existing;
    }

    // Periodic pruning to avoid unbounded memory growth
    if (buckets.size > 5000) {
      for (const [k, b] of buckets.entries()) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetSec = Math.ceil((bucket.resetAt - now) / 1000);

    if (bucket.count > maxRequests) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please retry later.', retryAfterSeconds: resetSec }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.max(1, resetSec)),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
          },
        },
      );
    }

    await next();
    c.res.headers.set('X-RateLimit-Limit', String(maxRequests));
    c.res.headers.set('X-RateLimit-Remaining', String(remaining));
    c.res.headers.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  };
}

// ---------------------------------------------------------------------------
// 3. Web Crypto Timing-Safe Comparison & HMAC-SHA256 Replay Protection
// ---------------------------------------------------------------------------
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function computeHmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyHmacSignature(secret: string, payload: string, signatureHeader: string): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const expected = await computeHmacSha256Hex(secret, payload);
  const provided = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  return timingSafeEqualStrings(expected, provided);
}

export async function verifyWebhookRequest(options: {
  secret: string;
  rawBody: string;
  signatureHeader: string;
  timestampHeader?: string | undefined;
  toleranceSeconds?: number;
  nowMs?: number;
}): Promise<{ valid: boolean; reason?: string }> {
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  const nowMs = options.nowMs ?? Date.now();

  if (options.timestampHeader) {
    const rawTs = options.timestampHeader.trim();
    const parsedEpochSec = /^\d+$/.test(rawTs)
      ? Number.parseInt(rawTs, 10)
      : Math.floor(Date.parse(rawTs) / 1000);
    if (!Number.isFinite(parsedEpochSec) || Number.isNaN(parsedEpochSec)) {
      return { valid: false, reason: 'Invalid webhook timestamp header' };
    }
    const skewSec = Math.abs(Math.floor(nowMs / 1000) - parsedEpochSec);
    if (skewSec > toleranceSeconds) {
      return { valid: false, reason: `Webhook timestamp outside ${toleranceSeconds}s replay tolerance` };
    }
    // Accept signature computed over `${timestamp}.${rawBody}` or rawBody
    const signedWithTs = await verifyHmacSignature(options.secret, `${rawTs}.${options.rawBody}`, options.signatureHeader);
    if (signedWithTs) return { valid: true };
  }

  const signedRaw = await verifyHmacSignature(options.secret, options.rawBody, options.signatureHeader);
  if (signedRaw) return { valid: true };
  return { valid: false, reason: 'Invalid webhook HMAC signature' };
}

// ---------------------------------------------------------------------------
// 4. Zod Validation Schemas for API Endpoints
// ---------------------------------------------------------------------------
export const RepoSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Repository must be in owner/name format');

export const QuarantineActionSchema = z.object({
  testId: z.string().min(1).max(256),
  state: z.boolean(),
  reason: z.string().max(500).optional(),
  owner: z.string().max(120).optional(),
  mode: z.enum(['manual', 'auto', 'override']).optional(),
});

export const QuarantinePolicySchema = z.object({
  enabled: z.boolean(),
  flakinessScoreThreshold: z.number().int().min(1).max(100),
  minFlipCount: z.number().int().min(1).max(50),
  minSampleSize: z.number().int().min(1).max(200),
  autoGraduatePasses: z.number().int().min(1).max(100),
  nonBlockingMode: z.boolean(),
  defaultOwner: z.string().trim().min(1).max(120).optional(),
});

export const NotificationPreferenceSchema = z.object({
  channel: z.enum(['slack', 'discord', 'email', 'webhook']),
  target: z.string().trim().min(3).max(500),
  signingSecret: z.string().min(8).max(256).optional(),
  events: z.array(z.enum(['PROVEN_FLAKE_DETECTED', 'AUTO_QUARANTINED', 'AUTO_GRADUATED', 'DAILY_DIGEST', 'WEEKLY_DIGEST'])).min(1),
  digestFrequency: z.enum(['realtime', 'daily', 'weekly']).default('realtime'),
  dedupWindowMinutes: z.number().int().min(1).max(10080).default(60),
  rateLimitPerHour: z.number().int().min(1).max(500).default(20),
  enabled: z.boolean().default(true),
});

export const OrganizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).min(2).max(48),
});

export const ApiKeyCreateSchema = z.object({
  repo: RepoSchema.optional(),
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.enum(['read', 'ingest', 'quarantine', 'admin'])).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const IssueTrackerConfigSchema = z.object({
  provider: z.enum(['github', 'jira', 'linear']),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).refine((val) => Object.keys(val).length > 0, {
    message: 'config object must contain at least one key',
  }),
});

export const CiWebhookSchema = z.object({
  provider: z.enum(['github', 'gitlab', 'circleci', 'jenkins', 'generic']).default('generic'),
  repo: RepoSchema,
  branch: z.string().min(1).max(120).default('main'),
  commitSha: z.string().min(4).max(64),
  format: z.enum(['junit', 'ctrf', 'jest', 'vitest', 'playwright', 'pytest', 'mocha', 'go']).default('junit'),
  report: z.string().min(2),
  prNumber: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// 5. Audit Log Persistence Helper
// ---------------------------------------------------------------------------
export async function recordAuditLog(
  db: { insert(table: typeof auditLogs): { values(row: unknown): Promise<unknown> } },
  entry: {
    orgId?: string | null;
    repo?: string | null;
    actorId: string;
    actorType: 'user' | 'token' | 'system';
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    orgId: entry.orgId ?? null,
    repo: entry.repo ?? null,
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
  });
}
