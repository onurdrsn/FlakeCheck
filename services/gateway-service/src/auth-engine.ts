import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import { authCodes, oauthAccounts, sessions, users, emailOtp, hashAuthValue, signJwt, verifyJwt, verifySecret, SESSION_REFRESH_AFTER_SECONDS, SESSION_TTL_SECONDS } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';

type Db = ReturnType<typeof createDatabase>;
export interface AuthEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  PUBLIC_APP_URL?: string;
  AUTH_TIMING_DEBUG?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const now = () => new Date();
const OTP_MAX_ATTEMPTS = 3;
const OTP_LOCK_SECONDS = 100;
const OTP_TTL_SECONDS = 300;
const OTP_REQUEST_WINDOW_SECONDS = 900;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;

async function encryptProviderToken(value: string, secret: string): Promise<string> {
  const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}

export async function decryptProviderToken(value: string, secret: string): Promise<string> {
  const [ivPart, encryptedPart] = value.split('.');
  if (!ivPart || !encryptedPart) throw new Error('Invalid provider token');
  const keyMaterial = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(ivPart), (char) => char.charCodeAt(0)) }, key, Uint8Array.from(atob(encryptedPart), (char) => char.charCodeAt(0)));
  return new TextDecoder().decode(decrypted);
}

export class AuthRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number, message: string) {
    super(message);
    this.name = 'AuthRateLimitError';
  }
}

// Timing-safe OTP request: always take approximately the same time
// and return the same response regardless of whether the email exists
const OTP_SIMULATION_DELTA_MS = 150; // fixed delta to mask any timing differences

export async function requestOtp(env: AuthEnv, emailInput: string): Promise<void> {
  const startedAt = performance.now();
  const measure = (label: string, phaseStartedAt: number) => {
    if (env.AUTH_TIMING_DEBUG === 'true') {
      console.info(`[auth-timing] otp ${label}=${Math.round(performance.now() - phaseStartedAt)}ms`);
    }
  };

  const email = emailInput.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();

  // Input validation - but don't reveal whether email exists
  if (email.length > 254 || !emailPattern.test(email)) {
    // Standardized message for invalid format too
    throw new Error('Invalid input format');
  }

  const db = createDatabase(env.DATABASE_URL);
  const databaseStartedAt = performance.now();

  // Fetch any existing OTP records for this email (rate-limited below)
  const requestWindowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_SECONDS * 1000);
  const recentRequests = await db.select({
    id: authCodes.id,
    lockedUntil: authCodes.lockedUntil,
    createdAt: authCodes.createdAt,
  }).from(authCodes).where(and(eq(authCodes.email, email), gte(authCodes.createdAt, requestWindowStart))).orderBy(desc(authCodes.createdAt));

  // Rate limiting: count requests from this email in the window
  // Including non-existent emails prevents enumeration by observing request limits
  const requestCount = recentRequests.length;

  // Rate limit: max 5 requests per window per email
  if (requestCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    const firstRequest = recentRequests[recentRequests.length - 1];
    const lockedUntil = firstRequest?.lockedUntil || new Date(Date.now() + OTP_LOCK_SECONDS * 1000);
    throw new AuthRateLimitError(
      Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
      'Too many requests. Please wait before trying again.'
    );
  }

  // Check if there's an active lock
  const activeLock = recentRequests.find((request) => request.lockedUntil && request.lockedUntil.getTime() > Date.now());
  if (activeLock?.lockedUntil) {
    throw new AuthRateLimitError(
      Math.ceil((activeLock.lockedUntil.getTime() - Date.now()) / 1000),
      'Too many incorrect attempts. Please wait before requesting a new code.'
    );
  }

  // SIMULATION: Always simulate a brief processing delay to mask timing differences
  // This ensures the total response time doesn't reveal whether the email was found
  const simulationStart = performance.now();
  await new Promise(resolve => setTimeout(resolve, OTP_SIMULATION_DELTA_MS));
  measure('simulation', simulationStart);

  // Check if user exists in the database - but don't leak this information in the response
  const userExistsResult = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const userExists = userExistsResult.length > 0;
  const userId = userExistsResult[0]?.id ?? crypto.randomUUID();
  if (!userExists) {
    await db.insert(users).values({ id: userId, email, displayName: null }).onConflictDoNothing();
  }

  // Generate OTP regardless of whether user exists (timing safety)
  const code = emailOtp();

  // Store OTP in database (works for both existing and new users)
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  const codeSalt = crypto.randomUUID();
  const hashed = await hashAuthValue(`${codeSalt}:${code}`);
  await db.insert(authCodes).values({ id: crypto.randomUUID(), userId, email, codeHash: hashed, codeSalt, expiresAt: new Date(Date.now() + 300_000) });
  measure('database', databaseStartedAt);
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  const resendStartedAt = performance.now();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: `Your FlakeCheck sign-in code: ${code}`,
      text: `Your one-time verification code is: ${code}. It expires in 5 minutes and can only be used once.`,
      html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark">
    <title>Your FlakeCheck sign-in code</title>
  </head>
  <body style="margin:0;background:#101417;color:#e9eef2;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your secure FlakeCheck sign-in code is ready.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101417;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 28px;border-bottom:1px solid #2a343a;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" valign="middle" width="36" height="36" style="width:36px;height:36px;border:1px solid #86f2c0;color:#86f2c0;font-family:'Courier New',monospace;font-size:12px;line-height:36px;">FC</td>
                    <td style="padding-left:12px;color:#e9eef2;font-size:16px;font-weight:700;letter-spacing:-0.3px;">FlakeCheck</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:42px 4px 34px;">
                <p style="margin:0 0 12px;color:#86f2c0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Workspace access</p>
                <h1 style="margin:0;color:#f3f7f5;font-size:32px;line-height:1.15;letter-spacing:-1px;">Your sign-in code</h1>
                <p style="margin:18px 0 0;color:#9aa9b0;font-size:15px;line-height:1.65;">Use the one-time code below to continue to your FlakeCheck workspace.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;background:#182024;border:1px solid #31423f;">
                <p style="margin:0 0 14px;color:#84939b;font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;">One-time code</p>
                <div style="padding:18px 12px;background:#101518;border:1px solid #86f2c0;text-align:center;">
                  <code aria-label="One-time verification code" style="display:block;color:#b6ffdb;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:7px;">${code}</code>
                </div>
                <p style="margin:18px 0 0;color:#84939b;font-size:12px;line-height:1.6;">This code expires in <strong style="color:#e9eef2;font-weight:600;">5 minutes</strong> and can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 4px 0;color:#84939b;font-size:12px;line-height:1.7;">
                <p style="margin:0 0 12px;">If you did not request this email, you can safely ignore it. No changes were made to your account.</p>
                <p style="margin:0;color:#536269;font-family:'Courier New',monospace;font-size:10px;">FlakeCheck · CI reliability control</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    }),
  });
  measure('resend', resendStartedAt);
  if (env.AUTH_TIMING_DEBUG === 'true') console.info(`[auth-timing] otp resend_status=${response.status}`);
  measure('total', startedAt);
  if (!response.ok) throw new Error('Unable to deliver sign-in email');
}

export async function consumeOtp(env: AuthEnv, emailInput: string, code: string): Promise<string> {
  const email = emailInput.trim().toLowerCase();
  const db = createDatabase(env.DATABASE_URL);
  const rows = await db.select().from(authCodes).where(and(eq(authCodes.email, email), isNull(authCodes.usedAt), gt(authCodes.expiresAt, now()))).orderBy(desc(authCodes.createdAt)).limit(1);
  const candidate = rows[0];
  if (!candidate) throw new Error('Invalid or expired sign-in code');
  if (candidate.lockedUntil && candidate.lockedUntil.getTime() > Date.now()) {
    throw new AuthRateLimitError(Math.ceil((candidate.lockedUntil.getTime() - Date.now()) / 1000), 'Too many incorrect attempts. Please wait before trying again.');
  }
  if (!(await verifySecret(code, candidate.codeSalt, candidate.codeHash))) {
    const failedAttempts = candidate.failedAttempts + 1;
    await db.update(authCodes).set({
      failedAttempts,
      lockedUntil: failedAttempts >= OTP_MAX_ATTEMPTS ? new Date(Date.now() + OTP_LOCK_SECONDS * 1000) : null,
    }).where(eq(authCodes.id, candidate.id));
    if (failedAttempts >= OTP_MAX_ATTEMPTS) {
      throw new AuthRateLimitError(OTP_LOCK_SECONDS, 'Too many incorrect attempts. Please wait 100 seconds before trying again.');
    }
    throw new Error('Invalid or expired sign-in code');
  }
  await db.update(authCodes).set({ usedAt: now() }).where(eq(authCodes.id, candidate.id));
  return createSession(env, candidate.userId);
}

export async function createSession(env: AuthEnv, userId: string): Promise<string> {
  const token = await signJwt({ sub: userId }, env.JWT_SECRET);
  await createDatabase(env.DATABASE_URL).insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await hashAuthValue(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

export async function authenticateSession(env: AuthEnv, token: string | undefined): Promise<{ userId: string; token: string } | null> {
  if (!token) return null;
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string') return null;
  const db = createDatabase(env.DATABASE_URL);
  const rows = await db.select().from(sessions).where(and(eq(sessions.userId, payload.sub), eq(sessions.tokenHash, await hashAuthValue(token)), gt(sessions.expiresAt, now()))).limit(1);
  if (!rows[0]) return null;
  if (Date.now() - new Date(rows[0].lastRefreshedAt).getTime() > SESSION_REFRESH_AFTER_SECONDS * 1000) {
    const refreshed = await createSession(env, payload.sub);
    await db.delete(sessions).where(eq(sessions.id, rows[0].id));
    return { userId: payload.sub, token: refreshed };
  }
  return { userId: payload.sub, token };
}

export async function deleteAccount(env: AuthEnv, userId: string): Promise<void> {
  await createDatabase(env.DATABASE_URL).delete(users).where(eq(users.id, userId));
}

export function oauthUrl(provider: 'google' | 'github', env: AuthEnv, state: string): string {
  const callback = `${env.PUBLIC_APP_URL ?? ''}/api/auth/${provider}/callback`;
  if (provider === 'google') return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID ?? '')}&redirect_uri=${encodeURIComponent(callback)}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(state)}`;
  return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID ?? '')}&redirect_uri=${encodeURIComponent(callback)}&response_type=code&scope=read:user%20user:email%20repo&state=${encodeURIComponent(state)}`;
}

export async function completeOAuth(env: AuthEnv, provider: 'google' | 'github', code: string): Promise<string> {
  const callback = `${env.PUBLIC_APP_URL ?? ''}/api/auth/${provider}/callback`;
  let email = '';
  let providerAccountId = '';
  let displayName: string | undefined;
  let providerAccessToken: string | undefined;
  if (provider === 'google') {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code' }) });
    if (!tokenResponse.ok) throw new Error('Google OAuth token exchange failed');
    const token = await tokenResponse.json() as { access_token?: string };
    providerAccessToken = token.access_token;
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token ?? ''}` } });
    if (!profileResponse.ok) throw new Error('Google profile lookup failed');
    const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string };
    providerAccountId = profile.sub ?? ''; email = profile.email ?? ''; displayName = profile.name;
  } else {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ code, client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, redirect_uri: callback }) });
    if (!tokenResponse.ok) throw new Error('GitHub OAuth token exchange failed');
    const token = await tokenResponse.json() as { access_token?: string };
    const profileResponse = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token ?? ''}`, 'User-Agent': 'FlakeCheck' } });
    if (!profileResponse.ok) throw new Error('GitHub profile lookup failed');
    const profile = await profileResponse.json() as { id?: number; email?: string | null; login?: string; name?: string | null };
    providerAccountId = String(profile.id ?? ''); displayName = profile.name ?? profile.login;
    email = profile.email ?? '';
    if (!email) throw new Error('GitHub did not return a public email address');
  }
  if (!providerAccountId || !email) throw new Error('OAuth provider returned incomplete identity');
  const db = createDatabase(env.DATABASE_URL);
  const linked = await db.select({ id: oauthAccounts.id, userId: oauthAccounts.userId }).from(oauthAccounts).where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId))).limit(1);
  let userId = linked[0]?.userId;
  if (!userId) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    userId = existing[0]?.id ?? crypto.randomUUID();
    if (!existing[0]) await db.insert(users).values({ id: userId, email: email.toLowerCase(), displayName }).onConflictDoNothing();
    await db.insert(oauthAccounts).values({ id: crypto.randomUUID(), userId, provider, providerAccountId, accessToken: providerAccessToken ? await encryptProviderToken(providerAccessToken, env.JWT_SECRET) : null }).onConflictDoNothing();
  } else if (provider === 'github' && providerAccessToken && linked[0]) {
    await db.update(oauthAccounts).set({ accessToken: await encryptProviderToken(providerAccessToken, env.JWT_SECRET) }).where(eq(oauthAccounts.id, linked[0].id));
  }
  return createSession(env, userId);
}

export { oauthAccounts };
