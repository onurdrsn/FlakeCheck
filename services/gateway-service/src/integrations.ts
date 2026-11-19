export interface FlakeSummaryForCi {
  repo: string;
  commitSha: string;
  healthScore: number;
  activeFlakes: number;
  quarantinedCount: number;
  wasteMinutes: number;
  wasteUsd: number;
  dashboardUrl: string;
  topFlakes: Array<{ testName: string; flakinessScore: number; rootCause: string; remediation?: string }>;
}

export function renderPrCommentMarkdown(summary: FlakeSummaryForCi): string {
  const rows = summary.topFlakes.slice(0, 8).map(
    (f) => `| \`${f.testName}\` | **${f.flakinessScore}/100** | \`${f.rootCause}\` | ${f.remediation ?? 'Inspect failure logs'} |`,
  );
  const table = rows.length
    ? ['| Test | Score | Root Cause | Recommended Fix |', '|---|---:|---|---|', ...rows].join('\n')
    : '_No active flaky tests detected on this commit._';

  return [
    '<!-- flakecheck-pr-comment -->',
    `## FlakeCheck Reliability Report — \`${summary.repo}\``,
    '',
    `- **Health Score:** ${summary.healthScore}%`,
    `- **Active Flakes:** ${summary.activeFlakes} | **Quarantined:** ${summary.quarantinedCount}`,
    `- **Estimated CI Waste:** ${summary.wasteMinutes.toFixed(1)} min ($${summary.wasteUsd.toFixed(2)})`,
    '',
    table,
    '',
    `[Open full forensics in FlakeCheck](${summary.dashboardUrl})`,
  ].join('\n');
}

export async function postGitHubPrComment(
  repo: string,
  prNumber: number,
  token: string,
  summary: FlakeSummaryForCi,
  fetchImpl: typeof fetch = fetch,
): Promise<{ commentUrl: string }> {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FlakeCheck',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: renderPrCommentMarkdown(summary) }),
  });
  if (!res.ok) throw new Error(`GitHub PR comment failed with HTTP ${res.status}`);
  const data = (await res.json()) as { html_url?: string };
  return { commentUrl: data.html_url ?? `https://github.com/${repo}/pull/${prNumber}` };
}

export async function setGitHubCommitStatus(
  repo: string,
  commitSha: string,
  token: string,
  options: {
    state: 'success' | 'failure' | 'pending' | 'error';
    description: string;
    targetUrl: string;
    context?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/statuses/${commitSha}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FlakeCheck',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state: options.state,
      description: options.description.slice(0, 140),
      target_url: options.targetUrl,
      context: options.context ?? 'FlakeCheck / Reliability',
    }),
  });
  if (!res.ok) throw new Error(`GitHub commit status failed with HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Issue Tracker Auto-Open / Auto-Close (GitHub Issues, Jira, Linear)
// ---------------------------------------------------------------------------
export type IssueTrackerProvider = 'github' | 'jira' | 'linear';

export interface IssuePayload {
  repo: string;
  testId: string;
  testName: string;
  filePath: string;
  flakinessScore: number;
  rootCause: string;
  remediation: string;
  dashboardUrl: string;
}

export interface CreatedIssue {
  provider: IssueTrackerProvider;
  externalIssueId: string;
  externalIssueUrl: string;
}

export async function openTrackerIssue(
  provider: IssueTrackerProvider,
  config: Record<string, unknown>,
  issue: IssuePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedIssue> {
  const title = `[FlakeCheck] Flaky test: ${issue.testName} (score ${issue.flakinessScore}/100)`;
  const body = [
    `**Repository:** \`${issue.repo}\``,
    `**File:** \`${issue.filePath}\``,
    `**Flakiness Score:** ${issue.flakinessScore}/100`,
    `**Root Cause:** \`${issue.rootCause}\``,
    `**Recommended Fix:** ${issue.remediation}`,
    `**Dashboard:** ${issue.dashboardUrl}`,
  ].join('\n');

  if (provider === 'github') {
    const token = String(config.token ?? '');
    if (!token) throw new Error('GitHub issue tracker requires a token');
    const labels = Array.isArray(config.labels) ? config.labels.map(String) : ['flaky-test', 'flakecheck'];
    const res = await fetchImpl(`https://api.github.com/repos/${issue.repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'FlakeCheck',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels }),
    });
    if (!res.ok) throw new Error(`GitHub issue creation failed with HTTP ${res.status}`);
    const data = (await res.json()) as { number: number; html_url: string };
    return { provider: 'github', externalIssueId: String(data.number), externalIssueUrl: data.html_url };
  }

  if (provider === 'jira') {
    const baseUrl = String(config.baseUrl ?? '').replace(/\/+$/, '');
    const email = String(config.email ?? '');
    const apiToken = String(config.apiToken ?? '');
    const projectKey = String(config.projectKey ?? '');
    if (!baseUrl || !email || !apiToken || !projectKey) {
      throw new Error('Jira integration requires baseUrl, email, apiToken, and projectKey');
    }
    const auth = btoa(`${email}:${apiToken}`);
    const res = await fetchImpl(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: title,
          issuetype: { name: String(config.issueType ?? 'Bug') },
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
          },
          labels: ['flaky-test', 'flakecheck'],
        },
      }),
    });
    if (!res.ok) throw new Error(`Jira issue creation failed with HTTP ${res.status}`);
    const data = (await res.json()) as { key: string };
    return { provider: 'jira', externalIssueId: data.key, externalIssueUrl: `${baseUrl}/browse/${data.key}` };
  }

  // Linear GraphQL API
  const apiKey = String(config.apiKey ?? '');
  const teamId = String(config.teamId ?? '');
  if (!apiKey || !teamId) throw new Error('Linear integration requires apiKey and teamId');
  const res = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }',
      variables: { input: { teamId, title, description: body } },
    }),
  });
  if (!res.ok) throw new Error(`Linear issue creation failed with HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { issueCreate?: { issue?: { id: string; url: string } } } };
  const created = data.data?.issueCreate?.issue;
  if (!created) throw new Error('Linear API did not return created issue');
  return { provider: 'linear', externalIssueId: created.id, externalIssueUrl: created.url };
}

export async function closeTrackerIssue(
  provider: IssueTrackerProvider,
  config: Record<string, unknown>,
  repo: string,
  externalIssueId: string,
  reason = 'Automatically closed by FlakeCheck after test graduated from quarantine.',
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (provider === 'github') {
    const token = String(config.token ?? '');
    if (!token) throw new Error('GitHub issue tracker requires a token');
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FlakeCheck',
      'Content-Type': 'application/json',
    };
    await fetchImpl(`https://api.github.com/repos/${repo}/issues/${externalIssueId}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: reason }),
    });
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${externalIssueId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ state: 'closed' }),
    });
    if (!res.ok) throw new Error(`GitHub issue close failed with HTTP ${res.status}`);
    return;
  }

  if (provider === 'jira') {
    const baseUrl = String(config.baseUrl ?? '').replace(/\/+$/, '');
    const email = String(config.email ?? '');
    const apiToken = String(config.apiToken ?? '');
    const transitionId = String(config.doneTransitionId ?? '31');
    const auth = btoa(`${email}:${apiToken}`);
    const res = await fetchImpl(`${baseUrl}/rest/api/3/issue/${externalIssueId}/transitions`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (!res.ok) throw new Error(`Jira issue transition failed with HTTP ${res.status}`);
    return;
  }

  const apiKey = String(config.apiKey ?? '');
  const completedStateId = String(config.completedStateId ?? '');
  if (!apiKey || !completedStateId) throw new Error('Linear close requires apiKey and completedStateId');
  const res = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation CloseIssue($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }',
      variables: { id: externalIssueId, stateId: completedStateId },
    }),
  });
  if (!res.ok) throw new Error(`Linear issue close failed with HTTP ${res.status}`);
}
