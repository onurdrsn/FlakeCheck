import { Hono, type Context } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { QuarantineRPC } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';
import { DrizzleQuarantineStore } from './db/store.js';
import { evaluateAutoGraduation } from './graduation.js';
import { setQuarantine } from './lifecycle.js';
import { generateSkipList } from './skiplist.js';

export interface Env {
  DATABASE_URL: string;
  SERVICE_NAME?: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
  CRON_API_KEY?: string;
}

const ALLOWED_WEBHOOK_DOMAINS = new Set(['hooks.slack.com', 'discord.com', 'discordapp.com']);

function isValidWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_WEBHOOK_DOMAINS.has(url.hostname);
  } catch {
    return false;
  }
}

async function notifyGraduation(repo: string, testIds: string[], env: Env): Promise<void> {
  if (!testIds.length) return;
  const title = `Tests graduated from quarantine in ${repo}`;
  const payloads: Array<[string, Record<string, unknown>]> = [];
  if (env.SLACK_WEBHOOK_URL && isValidWebhookUrl(env.SLACK_WEBHOOK_URL)) {
    payloads.push([env.SLACK_WEBHOOK_URL, { text: title, attachments: [{ color: '#86f2c0', title, text: testIds.join(', ') }] }]);
  }
  if (env.DISCORD_WEBHOOK_URL && isValidWebhookUrl(env.DISCORD_WEBHOOK_URL)) {
    payloads.push([env.DISCORD_WEBHOOK_URL, { content: title, embeds: [{ title, color: 0x86f2c0, description: testIds.join(', ') }] }]);
  }
  await Promise.all(payloads.map(async ([url, body]) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Graduation webhook failed with ${response.status}`);
  }));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class QuarantineEntrypoint extends WorkerEntrypoint<Env> implements QuarantineRPC {
  private store() {
    return new DrizzleQuarantineStore(createDatabase(this.env.DATABASE_URL));
  }

  async setQuarantine(repo: string, testId: string, state: boolean, reason?: string): Promise<void> {
    await setQuarantine(this.store(), repo, testId, state, reason);
  }

  async evaluateAutoGraduation(repo: string): Promise<{ graduatedTestIds: string[] }> {
    const graduatedTestIds = await evaluateAutoGraduation(this.store(), repo);
    await notifyGraduation(repo, graduatedTestIds, this.env);
    return { graduatedTestIds };
  }

  async generateSkipList(repo: string, framework: 'jest' | 'playwright'): Promise<Record<string, unknown>> {
    return generateSkipList(await this.store().listQuarantined(repo), framework);
  }

  async runGraduation(): Promise<{ repositoriesProcessed: number; graduated: Record<string, string[]> }> {
    const repositories = new Set((await this.store().listAllQuarantined()).map((test) => test.repo));
    const graduated: Record<string, string[]> = {};
    for (const repo of repositories) {
      const result = await this.evaluateAutoGraduation(repo);
      graduated[repo] = result.graduatedTestIds;
    }
    return { repositoriesProcessed: repositories.size, graduated };
  }

  async scheduled(): Promise<void> {
    await this.runGraduation();
  }

  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/health', (context) => context.json({ service: this.env.SERVICE_NAME ?? 'quarantine-service', status: 'ok' }));

    const handleGraduationCron = async (context: Context<{ Bindings: Env }>) => {
      const expectedKey = context.env.CRON_API_KEY?.trim();
      if (!expectedKey) {
        return context.json({ error: 'CRON_API_KEY is not configured on the server' }, 500);
      }

      const authHeader = context.req.header('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const xApiKey = context.req.header('X-API-Key') ?? context.req.header('x-api-key');
      const queryKey = context.req.query('key') ?? context.req.query('apiKey');

      const providedKey = bearerToken ?? xApiKey ?? queryKey;
      if (!providedKey || !constantTimeEqual(providedKey, expectedKey)) {
        return context.json({ error: 'Unauthorized: invalid or missing cron API key' }, 401);
      }

      try {
        const result = await this.runGraduation();
        return context.json({
          status: 'ok',
          message: 'Quarantine graduation evaluation completed successfully',
          timestamp: new Date().toISOString(),
          ...result,
        });
      } catch (error) {
        console.error('Graduation evaluation failed:', error);
        return context.json({
          error: 'Graduation evaluation failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
      }
    };

    app.all('/cron/graduate', handleGraduationCron);
    app.all('/api/cron/graduate', handleGraduationCron);

    return app.fetch(request, this.env);
  }
}

export default QuarantineEntrypoint;
