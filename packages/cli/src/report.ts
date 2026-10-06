export type ReportFlake = { testId?: string; category?: string; confidence?: number; testName?: string; filePath?: string };
export type ReportSummary = { wasteSeconds: number; wasteUsd: number; activeFlakes: number };

export function githubMarkdown(summary: ReportSummary, flakes: ReportFlake[], dashboardUrl?: string): string {
  const rows = flakes.map((item) => `| ${item.testName ?? item.testId ?? '-'} | ${item.category ?? '-'} | ${item.confidence ?? 0}% |`);
  return [
    '## FlakeCheck report',
    '',
    `Detected **${summary.activeFlakes}** active flake(s).`,
    '',
    '| Test | Category | Confidence |',
    '|---|---|---:|',
    ...(rows.length ? rows : ['| None | - | - |']),
    '',
    `- Estimated CI waste: **${Math.round(summary.wasteSeconds)}s**`,
    `- Financial waste: **$${summary.wasteUsd.toFixed(4)}**`,
    dashboardUrl ? `- [Review evidence in FlakeCheck](${dashboardUrl})` : '',
    '',
    '<!-- flakecheck:report -->',
  ].filter(Boolean).join('\n');
}
