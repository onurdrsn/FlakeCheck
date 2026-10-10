export type ReportFlake = { testId?: string; category?: string; confidence?: number; testName?: string; filePath?: string };
export type ReportSummary = { wasteSeconds: number; wasteUsd: number; activeFlakes: number };

export function githubMarkdown(summary: ReportSummary, flakes: ReportFlake[], dashboardUrl?: string): string {
  const isHealthy = summary.activeFlakes === 0;
  const statusBadge = isHealthy
    ? '![Status](https://img.shields.io/badge/FlakeCheck-PASSED-brightgreen?style=flat-square)'
    : `![Status](https://img.shields.io/badge/FlakeCheck-${summary.activeFlakes}%20Flakes%20Detected-critical?style=flat-square)`;

  const rows = flakes.map(
    (item) => `| \`${item.testName ?? item.testId ?? '-'}\` | **${item.category ?? '-'}** | ${item.confidence ?? 0}% | \`${item.filePath ?? '-'}\` |`
  );

  return [
    '## 🛡️ FlakeCheck Test Reliability Report',
    '',
    statusBadge,
    '',
    isHealthy
      ? '> **✔ All evaluated tests are stable and deterministic.** No test flakiness or environment sensitivity detected.'
      : `> **⚠ Detected ${summary.activeFlakes} active flaky test(s)** requiring quarantine or investigation.`,
    '',
    '### 📊 Resource Impact',
    `| Metric | Value |`,
    `|:---|:---|`,
    `| **Active Flakes** | \`${summary.activeFlakes}\` |`,
    `| **CI Execution Waste** | \`${Math.round(summary.wasteSeconds)}s\` |`,
    `| **Estimated CI Cost** | \`$${summary.wasteUsd.toFixed(4)}\` |`,
    '',
    ...(isHealthy
      ? []
      : [
          '### 🔍 Detected Flaky Tests',
          '| Test Case | Classification | Confidence | File |',
          '|:---|:---|---:|:---|',
          ...rows,
          '',
        ]),
    dashboardUrl ? `🔗 [Open Live FlakeCheck Dashboard](${dashboardUrl})` : '',
    '',
    '<!-- flakecheck:report -->',
  ].filter(Boolean).join('\n');
}

