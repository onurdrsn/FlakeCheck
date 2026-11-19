import type { MiddlewareHandler } from 'hono';

export type RateLimitTier = 'auth' | 'ingest' | 'badge' | 'cron' | 'api';

export interface CfRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
}

export interface RateLimitEnv {
  RATE_LIMITER_DO?: DurableObjectNamespace;
  RATE_LIMITER_AUTH?: CfRateLimitBinding;
  RATE_LIMITER_INGEST?: CfRateLimitBinding;
  RATE_LIMITER_BADGE?: CfRateLimitBinding;
  RATE_LIMITER_CRON?: CfRateLimitBinding;
  RATE_LIMITER_API?: CfRateLimitBinding;
  RATE_LIMIT_AUTH_MAX?: string;
  RATE_LIMIT_INGEST_MAX?: string;
  RATE_LIMIT_BADGE_MAX?: string;
  RATE_LIMIT_CRON_MAX?: string;
  RATE_LIMIT_API_MAX?: string;
  RATE_LIMIT_WINDOW_MS?: string;
}

const DEFAULT_TIER_LIMITS: Record<RateLimitTier, number> = {
  auth: 20,
  ingest: 120,
  badge: 300,
  cron: 10,
  api: 180,
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveTierConfig(tier: RateLimitTier, env: RateLimitEnv): { maxRequests: number; windowMs: number } {
  const windowMs = parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 60_000);
  const envVal =
    tier === 'auth' ? env.RATE_LIMIT_AUTH_MAX
    : tier === 'ingest' ? env.RATE_LIMIT_INGEST_MAX
    : tier === 'badge' ? env.RATE_LIMIT_BADGE_MAX
    : tier === 'cron' ? env.RATE_LIMIT_CRON_MAX
    : env.RATE_LIMIT_API_MAX;
  return {
    maxRequests: parsePositiveInt(envVal, DEFAULT_TIER_LIMITS[tier]),
    windowMs,
  };
}

function getCfBinding(tier: RateLimitTier, env: RateLimitEnv): CfRateLimitBinding | undefined {
  if (tier === 'auth') return env.RATE_LIMITER_AUTH;
  if (tier === 'ingest') return env.RATE_LIMITER_INGEST;
  if (tier === 'badge') return env.RATE_LIMITER_BADGE;
  if (tier === 'cron') return env.RATE_LIMITER_CRON;
  return env.RATE_LIMITER_API;
}

/**
 * Distributed Durable Object Rate Limiter (atomic sliding-window counter per tier+client key).
 * Runs in a single global Durable Object instance per key so limits are enforced consistently
 * across all Cloudflare edge isolates.
 */
export class RateLimiterDO {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parsePositiveInt(url.searchParams.get('limit') ?? undefined, 60);
    const windowMs = parsePositiveInt(url.searchParams.get('windowMs') ?? undefined, 60_000);
    const now = Date.now();

    let count = (await this.state.storage.get<number>('count')) ?? 0;
    let resetAt = (await this.state.storage.get<number>('resetAt')) ?? 0;

    if (resetAt <= now) {
      count = 1;
      resetAt = now + windowMs;
    } else {
      count += 1;
    }

    await this.state.storage.put({ count, resetAt });

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    const decision: RateLimitDecision = {
      allowed,
      limit,
      remaining,
      resetEpochSeconds: Math.ceil(resetAt / 1000),
      retryAfterSeconds,
    };

    return new Response(JSON.stringify(decision), {
      status: allowed ? 200 : 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Local fallback store used only when neither Durable Object nor CF Rate Limit binding is attached (e.g. unit tests)
const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetFallbackRateLimits(): void {
  fallbackBuckets.clear();
}

export async function checkDistributedRateLimit(
  tier: RateLimitTier,
  clientKey: string,
  env: RateLimitEnv,
): Promise<RateLimitDecision> {
  const { maxRequests, windowMs } = resolveTierConfig(tier, env);
  const compositeKey = `${tier}:${clientKey}`;

  // 1. Prefer Durable Object distributed rate limiter
  if (env.RATE_LIMITER_DO) {
    const id = env.RATE_LIMITER_DO.idFromName(compositeKey);
    const stub = env.RATE_LIMITER_DO.get(id);
    const res = await stub.fetch(
      `https://rate-limiter.internal/check?limit=${maxRequests}&windowMs=${windowMs}`,
    );
    return (await res.json()) as RateLimitDecision;
  }

  // 2. Fallback to Cloudflare native Rate Limiting binding if configured
  const cfBinding = getCfBinding(tier, env);
  if (cfBinding) {
    const { success } = await cfBinding.limit({ key: compositeKey });
    const resetAt = Date.now() + windowMs;
    return {
      allowed: success,
      limit: maxRequests,
      remaining: success ? Math.max(0, maxRequests - 1) : 0,
      resetEpochSeconds: Math.ceil(resetAt / 1000),
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  // 3. Test/local fallback
  const now = Date.now();
  const existing = fallbackBuckets.get(compositeKey);
  let count = 1;
  let resetAt = now + windowMs;
  if (existing && existing.resetAt > now) {
    existing.count += 1;
    count = existing.count;
    resetAt = existing.resetAt;
  } else {
    fallbackBuckets.set(compositeKey, { count, resetAt });
  }
  const allowed = count <= maxRequests;
  return {
    allowed,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetEpochSeconds: Math.ceil(resetAt / 1000),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function distributedRateLimit(tier: RateLimitTier): MiddlewareHandler {
  return async (c, next) => {
    const env = (c.env ?? {}) as RateLimitEnv;
    const clientKey =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
      c.req.header('X-FlakeCheck-Token')?.slice(0, 12) ??
      'anonymous';

    const decision = await checkDistributedRateLimit(tier, clientKey, env);
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Please retry later.',
          tier,
          retryAfterSeconds: decision.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(decision.retryAfterSeconds),
            'X-RateLimit-Limit': String(decision.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(decision.resetEpochSeconds),
          },
        },
      );
    }

    await next();
    c.res.headers.set('X-RateLimit-Limit', String(decision.limit));
    c.res.headers.set('X-RateLimit-Remaining', String(decision.remaining));
    c.res.headers.set('X-RateLimit-Reset', String(decision.resetEpochSeconds));
  };
}
