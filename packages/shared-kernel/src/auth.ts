const encoder = new TextEncoder();
export const OTP_TTL_SECONDS = 300;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_REFRESH_AFTER_SECONDS = 7 * 24 * 60 * 60;

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function secureOtp(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = randomBytes(24);
  const required = ['A', 'a', '2', '!'];
  const generated = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  for (let index = 0; index < required.length; index += 1) generated[index] = required[index]!;
  for (let index = generated.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index]! % (index + 1);
    [generated[index], generated[swapIndex]] = [generated[swapIndex]!, generated[index]!];
  }
  return generated.join('');
}

export function emailOtp(): string {
  const bytes = randomBytes(4);
  const value = new DataView(bytes.buffer).getUint32(0);
  return String(value % 1_000_000).padStart(6, '0');
}

export async function hashAuthValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashSecret(secret: string, salt = crypto.randomUUID()): Promise<{ salt: string; hash: string }> {
  return { salt, hash: await hashAuthValue(`${salt}:${secret}`) };
}

export async function verifySecret(secret: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashAuthValue(`${salt}:${secret}`);
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

function base64url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decodeBase64url(value: string): string {
  return atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
}

export async function signJwt(payload: Record<string, unknown>, secret: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + SESSION_TTL_SECONDS }));
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return `${input}.${base64url(String.fromCharCode(...new Uint8Array(signature)))}`;
}

export async function verifyJwt(token: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(decodeBase64url(signature), (char) => char.charCodeAt(0)), encoder.encode(`${header}.${body}`));
  if (!valid) return null;
  const payload = JSON.parse(decodeBase64url(body)) as Record<string, unknown>;
  return typeof payload.exp === 'number' && payload.exp > now ? payload : null;
}

export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `flakecheck_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
export const expiredSessionCookie = () => sessionCookie('', 0);
