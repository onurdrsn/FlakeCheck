import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

function loadDatabaseUrl(): string {
  const validate = (value: string): string => {
    try {
      const host = new URL(value).hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        throw new Error('DATABASE_URL points to the local placeholder. Set a reachable Neon PostgreSQL URL before running migrations.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('DATABASE_URL points')) throw error;
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    return value;
  };
  if (process.env.DATABASE_URL?.trim()) return validate(process.env.DATABASE_URL);
  for (const file of ['.env', 'services/gateway-service/.dev.vars']) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8').split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) return validate(value);
  }
  throw new Error('DATABASE_URL is required. Set it in the shell, root .env, or services/gateway-service/.dev.vars before running a database command.');
}

export default defineConfig({
  schema: './packages/shared-kernel/src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: loadDatabaseUrl() },
  strict: true,
  verbose: true,
});
