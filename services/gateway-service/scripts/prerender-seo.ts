import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createSeoRouter } from '../src/seo/ssr.js';
import { SEO_GUIDES } from '../src/seo/content.js';
import { buildOpenApiSpec, renderInteractiveApiDocsHtml } from '../src/openapi.js';

const BASE_URL = (process.env.PUBLIC_APP_URL ?? 'https://flakecheck.onurd.com.tr').replace(/\/+$/, '');
const PUBLIC_DIR = resolve(process.cwd(), 'public');

function writeFileEnsureDir(relPath: string, content: string): void {
  const fullPath = resolve(PUBLIC_DIR, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

async function main() {
  const spaHtmlPath = resolve(PUBLIC_DIR, 'index.html');
  const spaHtml = readFileSync(spaHtmlPath, 'utf8');

  // 1. Preserve the React SPA entry for interactive app routes
  // Private/auth routes keep noindex, nofollow
  const privateSpaRoutes = ['app', 'dashboard', 'login'];
  for (const route of privateSpaRoutes) {
    writeFileEnsureDir(`${route}/index.html`, spaHtml);
  }

  // Public SPA routes (docs, status, support, privacy, terms) get index, follow
  const indexableSpaHtml = spaHtml.replace(
    /<meta name="robots" content="[^"]*"\s*\/?>/i,
    '<meta name="robots" content="index, follow" />',
  );
  const publicSpaRoutes = ['docs', 'status', 'support', 'privacy', 'terms'];
  for (const route of publicSpaRoutes) {
    writeFileEnsureDir(`${route}/index.html`, indexableSpaHtml);
  }

  // 2. Pre-render Edge-SSR SEO pages via the Hono SEO router
  const seo = createSeoRouter();
  const env = { PUBLIC_APP_URL: BASE_URL };

  const ssrTargets: Array<{ urlPath: string; filePath: string }> = [
    { urlPath: '/', filePath: 'index.html' },
    { urlPath: '/guides', filePath: 'guides/index.html' },
    { urlPath: '/changelog', filePath: 'changelog/index.html' },
    { urlPath: '/robots.txt', filePath: 'robots.txt' },
    { urlPath: '/sitemap.xml', filePath: 'sitemap.xml' },
    { urlPath: '/llms.txt', filePath: 'llms.txt' },
    { urlPath: '/og/home.svg', filePath: 'og/home.svg' },
    { urlPath: '/og/guides.svg', filePath: 'og/guides.svg' },
    { urlPath: '/og/changelog.svg', filePath: 'og/changelog.svg' },
  ];

  for (const guide of SEO_GUIDES) {
    ssrTargets.push({
      urlPath: `/${guide.section}/${guide.slug}`,
      filePath: `${guide.section}/${guide.slug}/index.html`,
    });
    ssrTargets.push({
      urlPath: `/og/${guide.slug}.svg`,
      filePath: `og/${guide.slug}.svg`,
    });
  }

  for (const target of ssrTargets) {
    const res = await seo.request(`${BASE_URL}${target.urlPath}`, {}, env);
    if (!res.ok) {
      throw new Error(`Failed to pre-render ${target.urlPath}: HTTP ${res.status}`);
    }
    const text = await res.text();
    writeFileEnsureDir(target.filePath, text);
  }

  // 3. Pre-render OpenAPI 3.1 spec and interactive /docs/api page
  writeFileEnsureDir('api/v1/openapi.json', `${JSON.stringify(buildOpenApiSpec(BASE_URL), null, 2)}\n`);
  writeFileEnsureDir('docs/api/index.html', renderInteractiveApiDocsHtml(BASE_URL));

  // 4. Write Cloudflare Pages _headers for security, caching, and noindex on private routes
  const cfHeaders = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/og/*
  Cache-Control: public, max-age=3600, s-maxage=86400

/app/*
  X-Robots-Tag: noindex, nofollow

/dashboard/*
  X-Robots-Tag: noindex, nofollow

/login/*
  X-Robots-Tag: noindex, nofollow
`;
  writeFileEnsureDir('_headers', cfHeaders);

  console.log(`Pre-rendered ${ssrTargets.length} SEO assets, ${privateSpaRoutes.length + publicSpaRoutes.length} SPA routes, OpenAPI docs, and _headers into public/`);
}

main().catch((error) => {
  console.error('prerender-seo failed:', error);
  process.exit(1);
});
