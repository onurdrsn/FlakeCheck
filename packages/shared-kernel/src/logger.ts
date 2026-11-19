export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|database[_-]?url|dsn)/i;
const SENSITIVE_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._~+/-]+=*|gh[pousr]_[A-Za-z0-9]{20,}|fc_[A-Za-z0-9_-]{16,}|postgres(?:ql)?:\/\/[^\s"']+)/gi;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]'),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(service: string, baseFields: Record<string, unknown> = {}): Logger {
  const emit = (level: LogLevel, event: string, fields?: Record<string, unknown>) => {
    const payload = redactValue({
      timestamp: new Date().toISOString(),
      level,
      service,
      event,
      ...baseFields,
      ...(fields ?? {}),
    });
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}
