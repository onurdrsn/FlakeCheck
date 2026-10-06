const BEARER_OR_API_KEY = /bearer\s+[a-zA-Z0-9_.-]{20,}|(?:ghp|gho|glpat|AKIA)[a-zA-Z0-9]{16,}/gi;
const JWT = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_.+/=-]*/g;
const KEY_VALUE_CREDENTIAL = /((?:password|secret|token|api_?key))\s*[:=]\s*["']?([^"' \s]+)/gi;

export function sanitizeSecrets(input: string): string {
  const maskedApiKeys = input.replace(BEARER_OR_API_KEY, '<SECRET_MASKED>');
  const maskedJwts = maskedApiKeys.replace(JWT, '<JWT_MASKED>');
  return maskedJwts.replace(KEY_VALUE_CREDENTIAL, (_match, key: string) => `${key}=<REDACTED>`);
}

export function normalizeFailureText(input: string): string {
  return sanitizeSecrets(input)
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>')
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<UUID>')
    .replace(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{4,5}/g, 'localhost:<PORT>')
    .replace(/0x[0-9a-fA-F]{6,16}/g, '<HEX>')
    .replace(/(?:\/home\/[^/\s]+\/\S+|\/var\/run\/\S+|[A-Za-z]:\\Users\\[^\\\s]+\\\S+)/g, '<PATH>')
    .replace(/\(\d+(?:\.\d+)?(?:ms|s)\)/g, '(<DURATION>)');
}
