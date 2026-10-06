export type WebhookEvent = 'PROVEN_FLAKE_DETECTED' | 'AUTO_GRADUATED';
export type WebhookConfig = { slackUrl?: string; discordUrl?: string; dashboardUrl?: string };

export function formatWebhook(event: WebhookEvent, repo: string, payload: Record<string, unknown>, config: WebhookConfig) {
  const title = event === 'PROVEN_FLAKE_DETECTED' ? 'New proven flake detected' : 'Test graduated from quarantine';
  const text = `${title} in ${repo}`;
  return {
    slack: config.slackUrl ? { url: config.slackUrl, body: { text, attachments: [{ color: event === 'PROVEN_FLAKE_DETECTED' ? '#f5b970' : '#86f2c0', title, fields: Object.entries(payload).map(([field, value]) => ({ title: field, value: String(value), short: true })) }] } } : undefined,
    discord: config.discordUrl ? { url: config.discordUrl, body: { content: text, embeds: [{ title, color: event === 'PROVEN_FLAKE_DETECTED' ? 0xf5b970 : 0x86f2c0, fields: Object.entries(payload).map(([name, value]) => ({ name, value: String(value), inline: true })), url: config.dashboardUrl }] } } : undefined,
  };
}

export async function dispatchWebhook(event: WebhookEvent, repo: string, payload: Record<string, unknown>, config: WebhookConfig): Promise<void> {
  const formatted = formatWebhook(event, repo, payload, config);
  await Promise.all([formatted.slack, formatted.discord].filter((target): target is NonNullable<typeof target> => Boolean(target)).map(async (target) => {
    const response = await fetch(target.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target.body) });
    if (!response.ok) throw new Error(`Webhook delivery failed with ${response.status}`);
  }));
}
