export function buildOpenApiSpec(baseUrl: string) {
  const serverUrl = baseUrl.replace(/\/+$/, '') || 'https://flakecheck.onurd.com.tr';
  return {
    openapi: '3.1.0',
    info: {
      title: 'FlakeCheck Public REST API',
      version: '1.0.0',
      description:
        'Production API for FlakeCheck — statistical flaky test detection, root-cause forensics, automated quarantine policies, CI cost analytics, and issue tracker synchronization.',
      contact: {
        name: 'FlakeCheck Engineering',
        url: `${serverUrl}/support`,
      },
      license: {
        name: 'MIT',
        url: 'https://github.com/onurdrsn/FlakeCheck/blob/master/LICENSE',
      },
    },
    servers: [{ url: serverUrl, description: 'Production Gateway' }],
    components: {
      securitySchemes: {
        ProjectToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-FlakeCheck-Token',
          description: 'Repository-scoped API key (SHA-256 hashed at rest).',
        },
        SessionAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ ProjectToken: [] }, { SessionAuth: [] }],
    paths: {
      '/health': {
        get: {
          summary: 'Liveness & downstream service health check',
          tags: ['Observability'],
          security: [],
          responses: { '200': { description: 'Service status report' } },
        },
      },
      '/ready': {
        get: {
          summary: 'Readiness probe verifying Neon PostgreSQL connectivity',
          tags: ['Observability'],
          security: [],
          responses: {
            '200': { description: 'Ready to accept traffic' },
            '503': { description: 'Database or dependency unavailable' },
          },
        },
      },
      '/api/ingest': {
        post: {
          summary: 'Stream a test report (JUnit, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, Go)',
          tags: ['Ingestion'],
          parameters: [
            { name: 'X-FlakeCheck-Repo', in: 'header', required: true, schema: { type: 'string' } },
            { name: 'X-FlakeCheck-Format', in: 'header', required: true, schema: { type: 'string', enum: ['junit', 'ctrf', 'jest', 'vitest', 'playwright', 'pytest', 'mocha', 'go'] } },
            { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Run ingested and analyzed' } },
        },
      },
      '/api/v1/webhooks/ci': {
        post: {
          summary: 'Receive CI test reports via webhook and optionally post GitHub PR comment & commit status',
          tags: ['CI Integrations'],
          responses: { '200': { description: 'Webhook ingested' } },
        },
      },
      '/api/v1/analytics/overview': {
        get: {
          summary: 'Analytics overview: trend series, top 10 flakiest tests, CI waste cost, team breakdown',
          tags: ['Analytics'],
          parameters: [{ name: 'repo', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Analytics payload' } },
        },
      },
      '/api/v1/badge/{owner}/{repo}.svg': {
        get: {
          summary: 'Dynamic SVG health badge for README files',
          tags: ['Analytics'],
          security: [],
          parameters: [
            { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'image/svg+xml badge' } },
        },
      },
      '/api/v1/quarantine/policy': {
        get: { summary: 'Get repository auto-quarantine policy', tags: ['Quarantine'], responses: { '200': { description: 'Policy config' } } },
        put: { summary: 'Update repository auto-quarantine policy', tags: ['Quarantine'], responses: { '200': { description: 'Updated policy' } } },
      },
      '/api/v1/quarantine/history': {
        get: { summary: 'List quarantine audit history (owner, actor, mode, reason)', tags: ['Quarantine'], responses: { '200': { description: 'History entries' } } },
      },
      '/api/v1/notifications/preferences': {
        get: { summary: 'List Slack, Discord, email, and webhook alert preferences', tags: ['Notifications'], responses: { '200': { description: 'Preference list' } } },
        post: { summary: 'Create or update a notification preference with dedup & rate limit controls', tags: ['Notifications'], responses: { '200': { description: 'Saved preference' } } },
      },
      '/api/v1/organizations': {
        get: { summary: 'List organizations the authenticated user belongs to', tags: ['Multi-Tenancy & Security'], responses: { '200': { description: 'Organizations list' } } },
        post: { summary: 'Create a new organization (assigns caller as owner)', tags: ['Multi-Tenancy & Security'], responses: { '201': { description: 'Organization created' } } },
      },
      '/api/v1/tokens': {
        post: { summary: 'Create a scoped, expiring repository API key', tags: ['Multi-Tenancy & Security'], responses: { '201': { description: 'Newly generated API key (shown once)' } } },
      },
      '/api/v1/audit-logs': {
        get: { summary: 'Retrieve security & governance audit logs for a repository', tags: ['Multi-Tenancy & Security'], responses: { '200': { description: 'Audit log entries' } } },
      },
      '/api/v1/issue-trackers': {
        get: { summary: 'List configured GitHub Issues / Jira / Linear trackers', tags: ['Issue Trackers'], responses: { '200': { description: 'Tracker configs' } } },
        put: { summary: 'Configure GitHub Issues, Jira, or Linear tracker', tags: ['Issue Trackers'], responses: { '200': { description: 'Saved config' } } },
      },
      '/api/v1/account/export': {
        get: { summary: 'GDPR/KVKK portable JSON export of user account data', tags: ['Compliance'], responses: { '200': { description: 'Portable account data export' } } },
      },
    },
  };
}

export function renderInteractiveApiDocsHtml(baseUrl: string): string {
  const specUrl = `${baseUrl.replace(/\/+$/, '')}/api/v1/openapi.json`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlakeCheck API Reference — OpenAPI 3.1 Docs</title>
  <meta name="description" content="Interactive OpenAPI 3.1 documentation for the FlakeCheck flaky test detection, quarantine policy, and CI analytics REST API." />
  <link rel="canonical" href="${baseUrl.replace(/\/+$/, '')}/docs/api" />
  <style>body{margin:0;background:#090b10;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;}</style>
</head>
<body>
  <script id="api-reference" data-url="${specUrl}" data-configuration='{"theme":"kepler","darkMode":true}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}
