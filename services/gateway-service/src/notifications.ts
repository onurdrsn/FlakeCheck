import { computeHmacSha256Hex } from './security.js';

export type AlertEventType =
  | 'PROVEN_FLAKE_DETECTED'
  | 'AUTO_QUARANTINED'
  | 'AUTO_GRADUATED'
  | 'DAILY_DIGEST'
  | 'WEEKLY_DIGEST';

export type AlertChannel = 'slack' | 'discord' | 'email' | 'webhook';

export interface NotificationPreferenceRecord {
  id: string;
  repo: string;
  channel: AlertChannel;
  target: string;
  signingSecret?: string | null;
  events: string[];
  digestFrequency: 'realtime' | 'daily' | 'weekly';
  dedupWindowMinutes: number;
  rateLimitPerHour: number;
  enabled: boolean;
}

export interface AlertPayload {
  event: AlertEventType;
  repo: string;
  title: string;
  summary: string;
  dedupKey: string;
  dashboardUrl?: string;
  fields: Record<string, string | number>;
}

export interface DeliveryStore {
  wasRecentlyDelivered(dedupKey: string, withinMinutes: number): Promise<boolean>;
  countRecentDeliveries(repo: string, channel: AlertChannel, withinMinutes: number): Promise<number>;
  recordDelivery(entry: {
    repo: string;
    channel: AlertChannel;
    eventType: AlertEventType;
    dedupKey: string;
    status: 'sent' | 'deduplicated' | 'rate_limited' | 'failed';
    error?: string;
  }): Promise<void>;
}

export interface NotificationEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface DispatchOutcome {
  channel: AlertChannel;
  target: string;
  status: 'sent' | 'deduplicated' | 'rate_limited' | 'failed' | 'skipped';
  error?: string;
}

export async function dispatchAlert(
  pref: NotificationPreferenceRecord,
  payload: AlertPayload,
  store: DeliveryStore,
  env: NotificationEnv = {},
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchOutcome> {
  if (!pref.enabled || !pref.events.includes(payload.event)) {
    return { channel: pref.channel, target: pref.target, status: 'skipped' };
  }

  const scopedDedupKey = `${pref.repo}:${pref.channel}:${payload.dedupKey}`;

  // 1. Deduplication window check
  if (await store.wasRecentlyDelivered(scopedDedupKey, pref.dedupWindowMinutes)) {
    await store.recordDelivery({
      repo: pref.repo,
      channel: pref.channel,
      eventType: payload.event,
      dedupKey: scopedDedupKey,
      status: 'deduplicated',
    });
    return { channel: pref.channel, target: pref.target, status: 'deduplicated' };
  }

  // 2. Hourly rate limit check
  const recentCount = await store.countRecentDeliveries(pref.repo, pref.channel, 60);
  if (recentCount >= pref.rateLimitPerHour) {
    await store.recordDelivery({
      repo: pref.repo,
      channel: pref.channel,
      eventType: payload.event,
      dedupKey: scopedDedupKey,
      status: 'rate_limited',
    });
    return { channel: pref.channel, target: pref.target, status: 'rate_limited' };
  }

  try {
    if (pref.channel === 'slack') {
      const res = await fetchImpl(pref.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${payload.title} — ${payload.repo}`,
          attachments: [
            {
              color: payload.event === 'AUTO_GRADUATED' ? '#10b981' : '#f59e0b',
              title: payload.title,
              text: payload.summary,
              fields: Object.entries(payload.fields).map(([title, value]) => ({
                title,
                value: String(value),
                short: true,
              })),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Slack returned HTTP ${res.status}`);
    } else if (pref.channel === 'discord') {
      const res = await fetchImpl(pref.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**${payload.title}** (${payload.repo})`,
          embeds: [
            {
              title: payload.title,
              description: payload.summary,
              color: payload.event === 'AUTO_GRADUATED' ? 0x10b981 : 0xf59e0b,
              ...(payload.dashboardUrl ? { url: payload.dashboardUrl } : {}),
              fields: Object.entries(payload.fields).map(([name, value]) => ({
                name,
                value: String(value),
                inline: true,
              })),
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Discord returned HTTP ${res.status}`);
    } else if (pref.channel === 'email') {
      if (!env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured for email notifications');
      }
      const rows = Object.entries(payload.fields)
        .map(([k, v]) => `<tr><td style="padding:4px 8px;color:#94a3b8">${k}</td><td style="padding:4px 8px;font-weight:600">${v}</td></tr>`)
        .join('');
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL ?? 'FlakeCheck Alerts <alerts@flakecheck.onurd.com.tr>',
          to: [pref.target],
          subject: `[FlakeCheck] ${payload.title} (${payload.repo})`,
          html: `<h2>${payload.title}</h2><p>${payload.summary}</p><table>${rows}</table>${payload.dashboardUrl ? `<p><a href="${payload.dashboardUrl}">Open FlakeCheck Dashboard</a></p>` : ''}`,
        }),
      });
      if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}`);
    } else if (pref.channel === 'webhook') {
      const bodyStr = JSON.stringify({
        event: payload.event,
        repo: payload.repo,
        title: payload.title,
        summary: payload.summary,
        fields: payload.fields,
        dashboardUrl: payload.dashboardUrl ?? null,
        timestamp: new Date().toISOString(),
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-FlakeCheck-Event': payload.event,
      };
      if (pref.signingSecret) {
        headers['X-FlakeCheck-Signature'] = `sha256=${await computeHmacSha256Hex(pref.signingSecret, bodyStr)}`;
      }
      const res = await fetchImpl(pref.target, { method: 'POST', headers, body: bodyStr });
      if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`);
    }

    await store.recordDelivery({
      repo: pref.repo,
      channel: pref.channel,
      eventType: payload.event,
      dedupKey: scopedDedupKey,
      status: 'sent',
    });
    return { channel: pref.channel, target: pref.target, status: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.recordDelivery({
      repo: pref.repo,
      channel: pref.channel,
      eventType: payload.event,
      dedupKey: scopedDedupKey,
      status: 'failed',
      error: message,
    });
    return { channel: pref.channel, target: pref.target, status: 'failed', error: message };
  }
}

export function buildDigestPayload(
  frequency: 'daily' | 'weekly',
  repo: string,
  metrics: {
    healthScore: number;
    activeFlakes: number;
    quarantinedCount: number;
    wasteMinutes: number;
    wasteUsd: number;
    topFlakyTests: Array<{ testName: string; flakinessScore: number }>;
  },
  dashboardUrl?: string,
): AlertPayload {
  const periodLabel = frequency === 'daily' ? 'Daily' : 'Weekly';
  const topList = metrics.topFlakyTests
    .slice(0, 5)
    .map((t, idx) => `${idx + 1}. ${t.testName} (${t.flakinessScore}/100)`)
    .join(' | ');

  return {
    event: frequency === 'daily' ? 'DAILY_DIGEST' : 'WEEKLY_DIGEST',
    repo,
    title: `${periodLabel} FlakeCheck Reliability Digest`,
    summary: topList
      ? `Top flaky tests: ${topList}`
      : 'No active flaky tests detected during this period.',
    dedupKey: `digest:${frequency}:${new Date().toISOString().slice(0, 10)}`,
    ...(dashboardUrl ? { dashboardUrl } : {}),
    fields: {
      'Health Score': `${metrics.healthScore}%`,
      'Active Flakes': metrics.activeFlakes,
      'Quarantined Tests': metrics.quarantinedCount,
      'CI Time Wasted': `${metrics.wasteMinutes.toFixed(1)} min`,
      'Estimated Cost': `$${metrics.wasteUsd.toFixed(2)}`,
    },
  };
}
