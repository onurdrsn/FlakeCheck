export function buildOpenApiSpec(baseUrl: string) {
  const serverUrl = baseUrl.replace(/\/+$/, '') || 'https://flakecheck.onurd.com.tr';

  const repoParameters = [
    {
      name: 'X-FlakeCheck-Repo',
      in: 'header',
      required: true,
      description: 'Target repository in canonical owner/name format.',
      schema: {
        type: 'string',
      },
    },
    {
      name: 'repo',
      in: 'query',
      required: false,
      description: 'Optional query override for target repository in owner/name format.',
      schema: {
        type: 'string',
      },
    },
  ];

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
          responses: { '200': { description: 'Service status report with detailed check telemetry' } },
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
            {
              name: 'X-FlakeCheck-Repo',
              in: 'header',
              required: true,
              description: 'Target repository in owner/name format',
              schema: { type: 'string' },
            },
            {
              name: 'X-FlakeCheck-Format',
              in: 'header',
              required: true,
              description: 'Test report format',
              schema: {
                type: 'string',
                enum: ['junit', 'ctrf', 'jest', 'vitest', 'playwright', 'pytest', 'mocha', 'go'],
              },
            },
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: { '201': { description: 'Run ingested and analyzed' } },
        },
      },
      '/api/v1/webhooks/ci': {
        post: {
          summary: 'Receive CI test reports via webhook and optionally post GitHub PR comment & commit status',
          tags: ['CI Integrations'],
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['provider', 'repo', 'branch', 'commitSha', 'format', 'report'],
                  properties: {
                    provider: { type: 'string', enum: ['github', 'gitlab', 'circleci', 'jenkins'] },
                    repo: { type: 'string' },
                    branch: { type: 'string' },
                    commitSha: { type: 'string' },
                    prNumber: { type: 'integer' },
                    format: { type: 'string', enum: ['junit', 'ctrf', 'jest', 'vitest', 'playwright', 'pytest', 'mocha', 'go'] },
                    report: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Webhook ingested' } },
        },
      },
      '/api/v1/analytics/overview': {
        get: {
          summary: 'Analytics overview: trend series, top 10 flakiest tests, CI waste cost, team breakdown',
          tags: ['Analytics'],
          parameters: repoParameters,
          responses: { '200': { description: 'Analytics payload' } },
        },
      },
      '/api/v1/badge/{owner}/{repo}.svg': {
        get: {
          summary: 'Dynamic SVG health badge for README files',
          tags: ['Analytics'],
          security: [],
          parameters: [
            {
              name: 'owner',
              in: 'path',
              required: true,
              description: 'GitHub organization or user name',
              schema: { type: 'string' },
            },
            {
              name: 'repo',
              in: 'path',
              required: true,
              description: 'Repository name (without .svg extension)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Rendered SVG health badge (image/svg+xml)',
              content: {
                'image/svg+xml': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
      },
      '/api/v1/quarantine/policy': {
        get: {
          summary: 'Get repository auto-quarantine policy',
          tags: ['Quarantine'],
          parameters: repoParameters,
          responses: { '200': { description: 'Policy config' } },
        },
        put: {
          summary: 'Update repository auto-quarantine policy',
          tags: ['Quarantine'],
          parameters: repoParameters,
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    flakinessScoreThreshold: { type: 'integer', minimum: 1, maximum: 100 },
                    minFlipCount: { type: 'integer', minimum: 1, maximum: 100 },
                    minSampleSize: { type: 'integer', minimum: 1, maximum: 500 },
                    autoGraduatePasses: { type: 'integer', minimum: 1, maximum: 500 },
                    nonBlockingMode: { type: 'boolean' },
                    defaultOwner: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated policy' } },
        },
      },
      '/api/v1/quarantine/history': {
        get: {
          summary: 'List quarantine audit history (owner, actor, mode, reason)',
          tags: ['Quarantine'],
          parameters: repoParameters,
          responses: { '200': { description: 'History entries' } },
        },
      },
      '/api/v1/notifications/preferences': {
        get: {
          summary: 'List Slack, Discord, email, and webhook alert preferences',
          tags: ['Notifications'],
          parameters: repoParameters,
          responses: { '200': { description: 'Preference list' } },
        },
        post: {
          summary: 'Create or update a notification preference with dedup & rate limit controls',
          tags: ['Notifications'],
          parameters: repoParameters,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['channel', 'target'],
                  properties: {
                    channel: { type: 'string', enum: ['slack', 'discord', 'email', 'webhook'] },
                    target: { type: 'string' },
                    events: { type: 'array', items: { type: 'string' } },
                    digestFrequency: { type: 'string', enum: ['realtime', 'daily', 'weekly'] },
                    dedupWindowMinutes: { type: 'integer' },
                    rateLimitPerHour: { type: 'integer' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Saved preference' } },
        },
      },
      '/api/v1/organizations': {
        get: {
          summary: 'List organizations the authenticated user belongs to',
          tags: ['Multi-Tenancy & Security'],
          responses: { '200': { description: 'Organizations list' } },
        },
        post: {
          summary: 'Create a new organization (assigns caller as owner)',
          tags: ['Multi-Tenancy & Security'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['slug', 'name'],
                  properties: {
                    slug: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Organization created' } },
        },
      },
      '/api/v1/tokens': {
        post: {
          summary: 'Create a scoped, expiring repository API key',
          tags: ['Multi-Tenancy & Security'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['repo', 'name'],
                  properties: {
                    repo: { type: 'string' },
                    name: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string', enum: ['read', 'ingest', 'quarantine', 'admin'] } },
                    expiresInDays: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Newly generated API key (shown once)' } },
        },
      },
      '/api/v1/audit-logs': {
        get: {
          summary: 'Retrieve security & governance audit logs for a repository',
          tags: ['Multi-Tenancy & Security'],
          parameters: repoParameters,
          responses: { '200': { description: 'Audit log entries' } },
        },
      },
      '/api/v1/issue-trackers': {
        get: {
          summary: 'List configured GitHub Issues / Jira / Linear trackers',
          tags: ['Issue Trackers'],
          parameters: repoParameters,
          responses: { '200': { description: 'Tracker configs' } },
        },
        put: {
          summary: 'Configure GitHub Issues, Jira, or Linear tracker',
          tags: ['Issue Trackers'],
          parameters: repoParameters,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['provider', 'config'],
                  properties: {
                    provider: { type: 'string', enum: ['github', 'jira', 'linear'] },
                    enabled: { type: 'boolean' },
                    config: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Saved config' } },
        },
      },
      '/api/v1/account/export': {
        get: {
          summary: 'GDPR/KVKK portable JSON export of user account data',
          tags: ['Compliance'],
          responses: { '200': { description: 'Portable account data export' } },
        },
      },
    },
  };
}

export function renderInteractiveApiDocsHtml(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const specUrl = `${cleanBase}/api/v1/openapi.json`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlakeCheck API Reference — OpenAPI 3.1 Docs</title>
  <meta name="description" content="Interactive OpenAPI 3.1 documentation for the FlakeCheck flaky test detection, quarantine policy, and CI analytics REST API." />
  <link rel="canonical" href="${cleanBase}/docs/api" />
  <style>
    body{margin:0;background:#090b10;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;}
    .fc-svg-preview-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px 20px;margin:12px;border-radius:12px;background:radial-gradient(circle at top,#131c2b,#0b0f17);border:1px solid rgba(52,211,153,0.28);color:#e2e8f0;text-align:center;}
    .fc-svg-preview-badge-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 24px;border-radius:10px;background:#070a0f;border:1px solid rgba(255,255,255,0.08);}
    .fc-svg-preview-label{font:600 11px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#34d399;letter-spacing:0.06em;text-transform:uppercase;}
    .fc-svg-preview-md{width:100%;max-width:520px;padding:10px 12px;border-radius:8px;background:#06080d;border:1px solid rgba(255,255,255,0.09);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#94a3b8;word-break:break-all;text-align:left;}
  </style>
</head>
<body>
  <script id="api-reference" data-url="${specUrl}" data-configuration='{"theme":"kepler","darkMode":true}'></script>
  <script>
    (function () {
      var lastSvgText = '';
      var lastSvgUrl = '';
      var origFetch = window.fetch;
      if (typeof origFetch === 'function') {
        window.fetch = function () {
          return origFetch.apply(this, arguments).then(function (res) {
            try {
              var ct = (res.headers && res.headers.get('content-type')) || '';
              if (ct.indexOf('image/svg+xml') !== -1 || (res.url && res.url.indexOf('.svg') !== -1)) {
                if (res.url) lastSvgUrl = res.url;
                res.clone().text().then(function (txt) {
                  if (txt && txt.indexOf('<svg') !== -1) {
                    lastSvgText = txt;
                    injectSvgPreview();
                  }
                }).catch(function () {});
              }
            } catch (e) {}
            return res;
          });
        };
      }

      function buildPreviewNode() {
        var wrap = document.createElement('div');
        wrap.className = 'fc-svg-preview-card';
        wrap.setAttribute('data-fc-svg-rendered', 'true');
        var dataUri = lastSvgText
          ? 'data:image/svg+xml;utf8,' + encodeURIComponent(lastSvgText)
          : lastSvgUrl;

        var title = document.createElement('span');
        title.className = 'fc-svg-preview-label';
        title.textContent = 'Live SVG Badge Preview (image/svg+xml)';
        wrap.appendChild(title);

        var box = document.createElement('div');
        box.className = 'fc-svg-preview-badge-wrap';

        var img1x = document.createElement('img');
        img1x.src = dataUri;
        img1x.alt = 'FlakeCheck SVG Badge (1x)';
        img1x.style.height = '20px';

        var img2x = document.createElement('img');
        img2x.src = dataUri;
        img2x.alt = 'FlakeCheck SVG Badge (2x HiDPI Preview)';
        img2x.style.height = '36px';

        box.appendChild(img2x);
        box.appendChild(img1x);
        wrap.appendChild(box);

        var md = document.createElement('div');
        md.className = 'fc-svg-preview-md';
        md.textContent = '![FlakeCheck Health](' + lastSvgUrl + ')';
        wrap.appendChild(md);
        return wrap;
      }

      function injectSvgPreview() {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        var node;
        while ((node = walker.nextNode())) {
          if (
            node.childElementCount === 0 &&
            node.textContent &&
            node.textContent.trim() === 'Preview unavailable' &&
            !node.getAttribute('data-fc-svg-replaced')
          ) {
            node.setAttribute('data-fc-svg-replaced', 'true');
            node.textContent = '';
            node.appendChild(buildPreviewNode());
          }
        }
      }

      var obs = new MutationObserver(function () {
        injectSvgPreview();
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        window.addEventListener('DOMContentLoaded', function () {
          obs.observe(document.body, { childList: true, subtree: true });
        });
      }
    })();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}

