import { describe, expect, it } from 'vitest';
import { formatWebhook } from '../src/webhooks.js';

describe('webhook payloads', () => {
  it('formats Slack and Discord event payloads', () => {
    const payload = formatWebhook('PROVEN_FLAKE_DETECTED', 'acme/app', { flakesFound: 2 }, { slackUrl: 'https://slack.invalid', discordUrl: 'https://discord.invalid' });
    expect(payload.slack?.body.attachments[0]?.color).toBe('#f5b970');
    expect(payload.discord?.body.embeds[0]?.fields[0]?.name).toBe('flakesFound');
  });
});
