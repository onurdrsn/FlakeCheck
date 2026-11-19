function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export interface BadgeOptions {
  label?: string;
  healthScore: number;
  activeFlakes: number;
  repo: string;
}

export function renderFlakeBadgeSvg(options: BadgeOptions): string {
  const label = options.label ?? 'FlakeCheck';
  const value = options.activeFlakes === 0
    ? `${options.healthScore}% healthy`
    : `${options.healthScore}% · ${options.activeFlakes} flaky`;
  const color = options.activeFlakes === 0
    ? '#10b981'
    : options.healthScore >= 80
      ? '#f59e0b'
      : '#ef4444';

  const labelWidth = Math.max(76, label.length * 7 + 16);
  const valueWidth = Math.max(88, value.length * 6.8 + 18);
  const totalWidth = Math.round(labelWidth + valueWidth);
  const labelX = Math.round(labelWidth / 2);
  const valueX = Math.round(labelWidth + valueWidth / 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="22" role="img" aria-label="${escapeXml(`${label}: ${value}`)}">
  <title>${escapeXml(`${label} — ${options.repo}: ${value}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".12"/>
    <stop offset="1" stop-opacity=".12"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="22" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="22" fill="#0f172a"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="22" fill="${color}"/>
    <rect width="${totalWidth}" height="22" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelX}" y="15" fill="#e2e8f0" font-weight="600">${escapeXml(label)}</text>
    <text x="${valueX}" y="15" fill="#04120c" font-weight="700">${escapeXml(value)}</text>
  </g>
</svg>`;
}

export function renderBadgeMarkdown(baseUrl: string, repo: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const [owner, name] = repo.split('/');
  const badgeUrl = `${cleanBase}/api/v1/badge/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}.svg`;
  return `[![FlakeCheck Health](${badgeUrl})](${cleanBase}/?utm_source=readme_badge&utm_medium=badge&utm_campaign=${encodeURIComponent(repo)})`;
}
