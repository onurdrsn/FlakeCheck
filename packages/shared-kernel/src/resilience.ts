export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

function defaultShouldRetry(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('connection') ||
    msg.includes('too many connections') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('429')
  );
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'operation'): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(10, options.baseDelayMs ?? 150);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 2000);
  const timeoutMs = options.timeoutMs ?? 8000;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(fn(attempt), timeoutMs, `attempt-${attempt}`);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * 50);
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1) + jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
