import { Hono } from 'hono';
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

  async scheduled(): Promise<void> {
    const repositories = new Set((await this.store().listAllQuarantined()).map((test) => test.repo));
    for (const repo of repositories) await this.evaluateAutoGraduation(repo);
  }

  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/health', (context) => context.json({ service: this.env.SERVICE_NAME ?? 'quarantine-service', status: 'ok' }));
    return app.fetch(request, this.env);
  }
}

export default QuarantineEntrypoint;
