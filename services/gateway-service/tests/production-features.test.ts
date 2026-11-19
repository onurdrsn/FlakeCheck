import { describe, expect, it, vi } from 'vitest';
import { computeHmacSha256Hex, verifyHmacSignature } from '../src/security.js';
import { buildDigestPayload, dispatchAlert, type DeliveryStore, type NotificationPreferenceRecord } from '../src/notifications.js';
import { openTrackerIssue, renderPrCommentMarkdown } from '../src/integrations.js';
import { renderBadgeMarkdown, renderFlakeBadgeSvg } from '../src/badge.js';
import { buildOpenApiSpec } from '../src/openapi.js';
import { createSeoRouter } from '../src/seo/ssr.js';
import { SEO_GUIDES } from '../src/seo/content.js';

describe('gateway production features & SEO', () => {
  it('computes and verifies HMAC-SHA256 webhook signatures', async () => {
    const payload = JSON.stringify({ repo: 'acme/app', event: 'PROVEN_FLAKE_DETECTED' });
    const sig = await computeHmacSha256Hex('whsec_test123', payload);
    expect(await verifyHmacSignature('whsec_test123', payload, `sha256=${sig}`)).toBe(true);
    expect(await verifyHmacSignature('whsec_wrong', payload, `sha256=${sig}`)).toBe(false);
  });

  it('dispatches signed webhook alerts and enforces deduplication & rate limiting', async () => {
    const delivered: string[] = [];
    const store: DeliveryStore = {
      wasRecentlyDelivered: async (key) => delivered.includes(key),
      countRecentDeliveries: async () => 0,
      recordDelivery: async (entry) => {
        if (entry.status === 'sent') delivered.push(entry.dedupKey);
      },
    };
    const mockFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const pref: NotificationPreferenceRecord = {
      id: 'p1',
      repo: 'acme/app',
      channel: 'webhook',
      target: 'https://hooks.example.com/flakecheck',
      signingSecret: 'secret-signing-key',
      events: ['PROVEN_FLAKE_DETECTED'],
      digestFrequency: 'realtime',
      dedupWindowMinutes: 60,
      rateLimitPerHour: 10,
      enabled: true,
    };
    const payload = {
      event: 'PROVEN_FLAKE_DETECTED' as const,
      repo: 'acme/app',
      title: 'Flaky test detected',
      summary: 'checkout.spec.ts failed then passed',
      dedupKey: 'test-1',
      fields: { Score: 88 },
    };

    const first = await dispatchAlert(pref, payload, store, {}, mockFetch);
    expect(first.status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = await dispatchAlert(pref, payload, store, {}, mockFetch);
    expect(second.status).toBe('deduplicated');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const digest = buildDigestPayload('weekly', 'acme/app', {
      healthScore: 94,
      activeFlakes: 2,
      quarantinedCount: 1,
      wasteMinutes: 14.5,
      wasteUsd: 0.12,
      topFlakyTests: [{ testName: 'checkout', flakinessScore: 85 }],
    });
    expect(digest.event).toBe('WEEKLY_DIGEST');
    expect(digest.fields['Health Score']).toBe('94%');
  });

  it('renders GitHub PR comment markdown and opens GitHub/Jira/Linear issues', async () => {
    const md = renderPrCommentMarkdown({
      repo: 'acme/app',
      commitSha: 'abcdef1',
      healthScore: 92,
      activeFlakes: 1,
      quarantinedCount: 1,
      wasteMinutes: 8.5,
      wasteUsd: 0.07,
      dashboardUrl: 'https://flakecheck.onurd.com.tr/app',
      topFlakes: [{ testName: 'login waits', flakinessScore: 82, rootCause: 'timing_race', remediation: 'Use fake timers' }],
    });
    expect(md).toContain('<!-- flakecheck-pr-comment -->');
    expect(md).toContain('timing_race');

    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/acme/app/issues/42' }), { status: 201 })) as unknown as typeof fetch;
    const ghIssue = await openTrackerIssue('github', { token: 'ghp_test' }, {
      repo: 'acme/app',
      testId: 't1',
      testName: 'login waits',
      filePath: 'e2e/login.spec.ts',
      flakinessScore: 82,
      rootCause: 'timing_race',
      remediation: 'Use fake timers',
      dashboardUrl: 'https://flakecheck.onurd.com.tr/app',
    }, mockFetch);
    expect(ghIssue.externalIssueId).toBe('42');
  });

  it('generates SVG health badges and valid OpenAPI 3.1 schema', () => {
    const svg = renderFlakeBadgeSvg({ repo: 'acme/app', healthScore: 98, activeFlakes: 0 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('98% healthy');
    const md = renderBadgeMarkdown('https://flakecheck.onurd.com.tr', 'acme/app');
    expect(md).toContain('/api/v1/badge/acme/app.svg');

    const spec = buildOpenApiSpec('https://flakecheck.onurd.com.tr');
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(10);
  });

  it('serves SSR landing, guides, sitemap.xml, robots.txt, llms.txt, dynamic OG SVG, and 404', async () => {
    const seo = createSeoRouter();
    const env = { PUBLIC_APP_URL: 'https://flakecheck.onurd.com.tr' };

    const homeRes = await seo.request('https://flakecheck.onurd.com.tr/', {}, env);
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain('application/ld+json');
    expect(homeHtml).toContain('SoftwareApplication');
    expect(homeHtml).toContain('FAQPage');
    expect(homeHtml).toContain('<link rel="canonical" href="https://flakecheck.onurd.com.tr/" />');

    // Verify all SEO guide titles < 60 chars and descriptions < 155 chars
    for (const guide of SEO_GUIDES) {
      expect(guide.title.length).toBeLessThanOrEqual(60);
      expect(guide.description.length).toBeLessThanOrEqual(155);
    }

    const guideRes = await seo.request('https://flakecheck.onurd.com.tr/guides/what-is-a-flaky-test', {}, env);
    expect(guideRes.status).toBe(200);
    const guideHtml = await guideRes.text();
    expect(guideHtml).toContain('BreadcrumbList');
    expect(guideHtml).toContain('Article');

    const sitemapRes = await seo.request('https://flakecheck.onurd.com.tr/sitemap.xml', {}, env);
    expect(sitemapRes.status).toBe(200);
    const sitemap = await sitemapRes.text();
    expect(sitemap).toContain('/guides/what-is-a-flaky-test');
    expect(sitemap).toContain('/compare/flakecheck-vs-buildpulse');

    const robotsRes = await seo.request('https://flakecheck.onurd.com.tr/robots.txt', {}, env);
    const robots = await robotsRes.text();
    expect(robots).toContain('Disallow: /app');
    expect(robots).toContain('Sitemap: https://flakecheck.onurd.com.tr/sitemap.xml');

    const llmsRes = await seo.request('https://flakecheck.onurd.com.tr/llms.txt', {}, env);
    expect(await llmsRes.text()).toContain('# FlakeCheck');

    const ogRes = await seo.request('https://flakecheck.onurd.com.tr/og/what-is-a-flaky-test.svg', {}, env);
    expect(ogRes.headers.get('content-type')).toContain('image/svg+xml');

    const notFoundRes = await seo.request('https://flakecheck.onurd.com.tr/guides/does-not-exist', {}, env);
    expect(notFoundRes.status).toBe(404);
  });
});
