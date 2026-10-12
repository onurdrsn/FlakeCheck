import { useEffect, useMemo, useState } from 'react';
import { translations, getStoredLocale, setStoredLocale, type Locale } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useFlakes } from '../hooks/useFlakes';
import { EvidenceCard } from '../components/EvidenceCard';
import { FlakeList } from '../components/FlakeList';
import { Navbar, type DashboardSection } from '../components/Navbar';
import { QuarantineModal } from '../components/QuarantineModal';
import { RunDetailsModal } from '../components/RunDetailsModal';
import { StatsCard } from '../components/StatsCard';
import { WorkspaceConnector } from '../components/WorkspaceConnector';
import type { Flake, RunDetails, SummaryRun } from '../types';
import { apiUrl, authHeaders, friendlyResponseError, setSessionToken, startOAuth, userFacingMessage } from '../http';

const WORKSPACE_REPOSITORY_KEY = 'flakecheck.workspace.repository';

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'flakecheck-report.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCsvRows(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escapeCsv = (val: string | number | null | undefined) =>
    `"${String(val ?? '').replaceAll('"', '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'flakecheck-report.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale());
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<'issues' | 'runs'>('issues');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | 'failed' | 'clean'>('all');
  const [groupRunsByCommit, setGroupRunsByCommit] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 768 : true));

  const [repo, setRepo] = useState(() => window.localStorage.getItem(WORKSPACE_REPOSITORY_KEY) ?? '');
  const [connectedRepo, setConnectedRepo] = useState(() => window.localStorage.getItem(WORKSPACE_REPOSITORY_KEY) ?? '');
  const [isConnecting, setIsConnecting] = useState(false);
  const [token, setToken] = useState('');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [modal, setModal] = useState(false);
  const [accountModal, setAccountModal] = useState(false);
  const [createdToken, setCreatedToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [account, setAccount] = useState<{ email: string | null; displayName: string | null; githubConnected?: boolean } | null>(null);
  const [pendingConnect, setPendingConnect] = useState(() => Boolean(window.localStorage.getItem(WORKSPACE_REPOSITORY_KEY)));
  const [bootstrapping, setBootstrapping] = useState(true);
  const [repositoryTokenConfigured, setRepositoryTokenConfigured] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<RunDetails | null>(null);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);
  const [runDetailsError, setRunDetailsError] = useState<string | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [githubRepoMeta, setGithubRepoMeta] = useState<{ defaultBranch: string | null; latestCommitSha: string | null }>({
    defaultBranch: null,
    latestCommitSha: null,
  });
  const runsPageSize = 6;

  const copy = translations[locale];
  const { api, connect, status, setStatus } = useAuth(repo, token);
  const { summary, flakes, selected, setSelected, setSummary, setFlakes, timeline, load, loadTimeline } = useFlakes(api);

  const isSyntheticCommit = (sha?: string | null) => {
    if (!sha) return true;
    const t = sha.trim();
    if (!t || t === 'local' || t === 'local-report' || t.startsWith('batch-')) return true;
    return /^[0-9a-f]{64}$/i.test(t);
  };

  const isSyntheticBranch = (br?: string | null) => {
    if (!br) return true;
    const t = br.trim();
    return !t || t === 'local' || t === 'local-report';
  };

  useEffect(() => {
    const target = connectedRepo.trim();
    if (!target || !target.includes('/')) {
      setGithubRepoMeta({ defaultBranch: null, latestCommitSha: null });
      return;
    }
    const [owner, name] = target.split('/');
    if (!owner || !name) return;
    let cancelled = false;
    Promise.all([
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`),
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?per_page=1`),
    ])
      .then(async ([repoRes, commitsRes]) => {
        if (cancelled) return;
        let defaultBranch: string | null = null;
        let latestCommitSha: string | null = null;
        if (repoRes.ok) {
          const data = (await repoRes.json()) as { default_branch?: string };
          if (typeof data?.default_branch === 'string' && data.default_branch.trim()) {
            defaultBranch = data.default_branch.trim();
          }
        }
        if (commitsRes.ok) {
          const commits = (await commitsRes.json()) as Array<{ sha?: string }>;
          if (Array.isArray(commits) && typeof commits[0]?.sha === 'string') {
            latestCommitSha = commits[0].sha;
          }
        }
        if (!cancelled) {
          setGithubRepoMeta({ defaultBranch, latestCommitSha });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connectedRepo]);

  const activeBranch =
    summary?.defaultBranch ||
    githubRepoMeta.defaultBranch ||
    (!isSyntheticBranch(summary?.lastBranch) ? summary?.lastBranch : null) ||
    'master';

  const activeCommitSha =
    (!isSyntheticCommit(summary?.lastCommitSha) ? summary?.lastCommitSha : null) ||
    githubRepoMeta.latestCommitSha ||
    '';

  const openRunDetails = async (runId: string) => {
    setSelectedRunId(runId);
    setRunDetails(null);
    setRunDetailsError(null);
    setLoadingRunDetails(true);
    try {
      const data = await api<RunDetails>(`/api/runs/${encodeURIComponent(runId)}`);
      setRunDetails(data);
    } catch (err) {
      setRunDetailsError(userFacingMessage(err, copy.failedToLoadRun));
    } finally {
      setLoadingRunDetails(false);
    }
  };

  const deleteRunHistory = async (target: 'all' | string | string[]) => {
    const isAll = target === 'all';
    const confirmMsg = isAll ? copy.confirmClearHistory : copy.confirmDeleteRun;
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;
    const idParam = isAll ? 'all' : Array.isArray(target) ? target.join(',') : target;
    const trackingKey = isAll ? 'all' : Array.isArray(target) ? target[0] ?? 'all' : target;
    setDeletingRunId(trackingKey);
    try {
      const result = await api<{ ok: boolean; deletedRuns: number; remainingRuns?: number }>(
        `/api/runs/${encodeURIComponent(idParam)}`,
        { method: 'DELETE' },
      );
      await load();
      setStatus(isAll ? copy.historyCleared : copy.runDeleted);
      if (selectedRunId) {
        if (
          isAll ||
          selectedRunId === idParam ||
          (Array.isArray(target) && target.includes(selectedRunId)) ||
          (selectedRunId === 'all' && !result.remainingRuns)
        ) {
          setSelectedRunId(null);
          setRunDetails(null);
          setRunDetailsError(null);
        } else if (selectedRunId === 'all') {
          await openRunDetails('all');
        }
      }
    } catch (err) {
      setStatus(userFacingMessage(err, copy.deleteRunError));
    } finally {
      setDeletingRunId(null);
    }
  };

  const isConnected = Boolean(summary && repo.trim() && connectedRepo === repo.trim());

  const handleLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setStoredLocale(nextLocale);
  };

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/auth/me'), { credentials: 'include', headers: { ...authHeaders() } }),
      fetch(apiUrl('/api/account/repositories'), { credentials: 'include', headers: { ...authHeaders() } }),
    ])
      .then(async ([accountResponse, repositoriesResponse]) => {
        if (accountResponse.ok) {
          setAccount((await accountResponse.json()) as { email: string | null; displayName: string | null; githubConnected?: boolean });
        }
        if (repositoriesResponse.ok) {
          const data = (await repositoriesResponse.json()) as { repositories?: string[] };
          const serverRepo = data.repositories?.[0];
          if (serverRepo) {
            setRepo(serverRepo);
            setConnectedRepo(serverRepo);
            window.localStorage.setItem(WORKSPACE_REPOSITORY_KEY, serverRepo);
            setPendingConnect(true);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    if (bootstrapping || !pendingConnect || !repo) return;
    setIsConnecting(true);
    setStatus(copy.connecting);
    void connect(load)
      .then(() => {
        setConnectedRepo(repo.trim());
        setStatus(copy.liveGatewayConnected);
      })
      .catch((error) => {
        setStatus(userFacingMessage(error, copy.connectPrompt));
      })
      .finally(() => {
        setIsConnecting(false);
        setPendingConnect(false);
      });
  }, [bootstrapping, pendingConnect, repo, connect, load, copy.connecting, copy.liveGatewayConnected, copy.connectPrompt]);

  useEffect(() => {
    if (accountModal || activeSection === 'settings') void loadRepositoryTokenStatus();
  }, [accountModal, activeSection, repo]);

  // If there are 0 flakes and runs exist, default the overview subtab to show issues or runs cleanly
  const filtered = useMemo(() => {
    return flakes.filter((flake) => {
      const matchesQuery = `${flake.filePath} ${flake.testName} ${flake.category}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.some((cat) => flake.category.toUpperCase().includes(cat));
      return matchesQuery && matchesCategory;
    });
  }, [flakes, query, selectedCategories]);

  // Process runs (with optional grouping by commit SHA and outcome filtering)
  const processedRuns = useMemo(() => {
    const rawRuns: SummaryRun[] = (summary?.recentRuns ?? []).map((r) => ({
      ...r,
      branch: (!isSyntheticBranch(r.branch) && r.branch) ? r.branch : activeBranch,
      commitSha: !isSyntheticCommit(r.commitSha) ? r.commitSha : activeCommitSha,
    }));
    let list: Array<SummaryRun & { mergedCount?: number; mergedIds?: string[] }> = rawRuns;

    if (groupRunsByCommit) {
      const map = new Map<string, SummaryRun & { mergedCount: number; mergedIds: string[] }>();
      for (const r of rawRuns) {
        const key = r.commitSha || r.id;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            ...r,
            totalAttempts: r.totalAttempts ?? 0,
            passedAttempts: r.passedAttempts ?? 0,
            failedAttempts: r.failedAttempts ?? 0,
            mergedCount: 1,
            mergedIds: [r.id],
          });
        } else {
          existing.totalAttempts = (existing.totalAttempts ?? 0) + (r.totalAttempts ?? 0);
          existing.passedAttempts = (existing.passedAttempts ?? 0) + (r.passedAttempts ?? 0);
          existing.failedAttempts = (existing.failedAttempts ?? 0) + (r.failedAttempts ?? 0);
          existing.mergedCount += 1;
          existing.mergedIds.push(r.id);
        }
      }
      list = Array.from(map.values());
    }

    return list.filter((r) => {
      const matchesSearch =
        !query.trim() ||
        r.id.toLowerCase().includes(query.toLowerCase()) ||
        (r.commitSha ?? '').toLowerCase().includes(query.toLowerCase());
      if (!matchesSearch) return false;
      if (runStatusFilter === 'failed') return (r.failedAttempts ?? 0) > 0;
      if (runStatusFilter === 'clean') return (r.failedAttempts ?? 0) === 0;
      return true;
    });
  }, [summary?.recentRuns, groupRunsByCommit, query, runStatusFilter, activeBranch, activeCommitSha]);

  const toggleCategoryFilter = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat],
    );
  };

  const connectWorkspace = async (nextRepo = repo, nextToken = token) => {
    const normalizedRepo = nextRepo.trim();
    if (!normalizedRepo) return;
    setIsConnecting(true);
    setStatus(copy.connecting);
    window.localStorage.setItem(WORKSPACE_REPOSITORY_KEY, normalizedRepo);
    setRepo(normalizedRepo);
    setToken(nextToken);
    try {
      await connect(load);
      setConnectedRepo(normalizedRepo);
      setStatus(copy.liveGatewayConnected);
    } catch (error) {
      setStatus(userFacingMessage(error, copy.connectPrompt));
    } finally {
      setIsConnecting(false);
      setPendingConnect(false);
    }
  };

  const disconnectWorkspace = () => {
    window.localStorage.removeItem(WORKSPACE_REPOSITORY_KEY);
    setConnectedRepo('');
    setRepo('');
    setToken('');
    setSummary(null);
    setFlakes([]);
    setSelected(null);
    setStatus(copy.disconnected);
  };

  async function quarantine(state: boolean) {
    if (!selected) return;
    try {
      await api('/api/quarantine', {
        method: 'POST',
        body: JSON.stringify({ testId: selected.testId, state, reason }),
      });
      setStatus(state ? `${selected.testName} ${copy.movedToQuarantine}` : `${selected.testName} ${copy.graduatedFromQuarantine}`);
      setModal(false);
      setReason('');
    } catch (error) {
      setStatus(userFacingMessage(error, copy.updateQuarantineError));
    }
  }

  async function createRepositoryToken() {
    try {
      const response = await fetch(apiUrl('/api/account/repository-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ repo }),
      });
      if (!response.ok) throw friendlyResponseError(response, copy.createTokenError);
      const result = (await response.json()) as { token: string };
      setCreatedToken(result.token);
      setRepositoryTokenConfigured(true);
      setTokenCopied(false);
      setStatus(copy.tokenCreated);
    } catch (error) {
      setStatus(userFacingMessage(error, copy.createTokenError));
    }
  }

  async function loadRepositoryTokenStatus() {
    if (!repo) return;
    const response = await fetch(apiUrl(`/api/account/repository-token?repo=${encodeURIComponent(repo)}`), {
      credentials: 'include',
      headers: { ...authHeaders() },
    });
    if (response.ok) setRepositoryTokenConfigured(((await response.json()) as { configured: boolean }).configured);
  }

  async function copyRepositoryToken() {
    try {
      await navigator.clipboard.writeText(createdToken);
      setTokenCopied(true);
    } catch {
      setStatus(copy.copyUnavailable);
    }
  }

  function copyOrRegenerateRepositoryToken() {
    if (createdToken) {
      void copyRepositoryToken();
    } else {
      void createRepositoryToken();
    }
  }

  if (bootstrapping || (pendingConnect && !summary)) {
    return (
      <div className="app-shell">
        <main className="main connector-main">
          <div className="connector-panel">
            <span className="eyebrow">{copy.workspace}</span>
            <h1>{copy.connectTitle}</h1>
            <p>{status || copy.connecting}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="app-shell">
        <aside className="sidebar connector-sidebar">
          <a className="brand" href="/">
            <span className="brand-mark">FC</span>
            <div>
              <strong>{copy.brandTitle}</strong>
              <small>{copy.brandTagline}</small>
            </div>
          </a>
          <div className="side-footer">
            <span className="status-dot" /> {copy.gatewayOnline}
            <small>{status}</small>
          </div>
        </aside>
        <main className="main connector-main">
          <WorkspaceConnector locale={locale} onConnect={connectWorkspace} />
        </main>
      </div>
    );
  }

  const totalRunsCount = summary.totalRuns ?? summary.recentRuns?.length ?? 0;
  const totalRunPages = Math.max(1, Math.ceil(processedRuns.length / runsPageSize));
  const currentRunPage = Math.min(runsPage, totalRunPages);
  const runStartIdx = (currentRunPage - 1) * runsPageSize;
  const visibleRuns = processedRuns.slice(runStartIdx, runStartIdx + runsPageSize);

  const exportReportJson = async () => {
    let allDetails: RunDetails | null = selectedRunId === 'all' && runDetails ? runDetails : null;
    if (!allDetails && totalRunsCount > 0) {
      try {
        allDetails = await api<RunDetails>('/api/runs/all');
      } catch {
        allDetails = null;
      }
    }
    downloadJson({
      repository: repo,
      branch: activeBranch,
      commitSha: activeCommitSha || null,
      exportedAt: new Date().toISOString(),
      summary: {
        healthScore: summary.healthScore,
        activeFlakes: summary.activeFlakes,
        totalRuns: totalRunsCount,
        totalAttempts: summary.totalAttempts ?? 0,
        classifiedTests: summary.classifiedTests ?? 0,
        cleanTests: summary.cleanTests ?? 0,
        wasteSeconds: summary.wasteSeconds,
        wasteUsd: summary.wasteUsd,
        runnerCostPerMinute: summary.runnerCostPerMinute ?? 0.008,
      },
      flakes,
      recentRuns: processedRuns,
      attempts: allDetails?.attempts ?? [],
    });
  };

  const exportReportCsv = async () => {
    let allDetails: RunDetails | null = selectedRunId === 'all' && runDetails ? runDetails : null;
    if (!allDetails && totalRunsCount > 0) {
      try {
        allDetails = await api<RunDetails>('/api/runs/all');
      } catch {
        allDetails = null;
      }
    }
    const attempts = allDetails?.attempts ?? [];
    if (attempts.length > 0) {
      const flakeMap = new Map(flakes.map((f) => [f.testId, f]));
      downloadCsvRows(
        [
          'repository',
          'branch',
          'commitSha',
          'runId',
          'testId',
          'testName',
          'suiteName',
          'filePath',
          'status',
          'category',
          'confidence',
          'durationMs',
          'attemptNumber',
          'failureSignature',
          'createdAt',
        ],
        attempts.map((a) => {
          const flk = flakeMap.get(a.testId);
          const category = a.classification?.category ?? flk?.category ?? (a.status === 'PASSED' ? 'CLEAN' : 'UNCLASSIFIED');
          const confidence = a.classification?.confidence ?? flk?.confidence ?? (a.status === 'PASSED' ? 100 : 0);
          return [
            repo,
            activeBranch,
            activeCommitSha || '',
            a.runId ?? allDetails?.run.id ?? '',
            a.testId,
            a.testName,
            a.suiteName,
            a.filePath,
            a.status,
            category,
            confidence,
            a.durationMs,
            a.attemptNumber,
            a.failureSignature ?? '',
            typeof a.createdAt === 'string' ? a.createdAt : new Date(a.createdAt).toISOString(),
          ];
        }),
      );
      return;
    }

    if (filtered.length > 0) {
      downloadCsvRows(
        ['repository', 'branch', 'commitSha', 'testId', 'testName', 'suiteName', 'filePath', 'category', 'confidence', 'runId'],
        filtered.map((item) => [
          repo,
          activeBranch,
          activeCommitSha || '',
          item.testId,
          item.testName,
          item.suiteName,
          item.filePath,
          item.category,
          item.confidence,
          item.runId,
        ]),
      );
      return;
    }

    downloadCsvRows(
      ['repository', 'branch', 'commitSha', 'runId', 'totalAttempts', 'passedAttempts', 'failedAttempts', 'createdAt'],
      processedRuns.map((r) => [
        repo,
        r.branch ?? activeBranch,
        r.commitSha || activeCommitSha || '',
        r.id,
        r.totalAttempts ?? 0,
        r.passedAttempts ?? 0,
        r.failedAttempts ?? 0,
        typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
      ]),
    );
  };

  const renderRunsTable = () => (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{copy.runId}</th>
              <th>{copy.commit}</th>
              <th>{copy.attempts}</th>
              <th>{copy.lastAnalyzed}</th>
              <th style={{ textAlign: 'right' }}>{copy.status}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRuns.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
                  {copy.noMatchingRuns}
                </td>
              </tr>
            ) : (
              visibleRuns.map((run) => (
                <tr key={run.id} onClick={() => void openRunDetails(run.id)}>
                  <td>
                    <button
                      type="button"
                      className="text-link"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--blue)',
                        fontWeight: 600,
                        fontSize: '12.5px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openRunDetails(run.id);
                      }}
                    >
                      {run.id.slice(0, 8)}… ⧉
                    </button>
                    {run.mergedCount && run.mergedCount > 1 && (
                      <span
                        style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.14)',
                          color: 'var(--blue)',
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {run.mergedCount} {copy.runsMerged}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {run.commitSha ? run.commitSha.slice(0, 7) : '—'}
                  </td>
                  <td>
                    <span style={{ color: 'var(--mint)', fontWeight: 600, fontSize: '12.5px' }}>
                      {run.passedAttempts ?? run.totalAttempts ?? 0} {copy.passed.toLowerCase()}
                    </span>
                    {run.failedAttempts ? (
                      <span style={{ color: 'var(--red)', marginLeft: '10px', fontWeight: 700, fontSize: '12.5px' }}>
                        {run.failedAttempts} {copy.failed.toLowerCase()}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    {new Date(run.createdAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          background: run.failedAttempts ? 'rgba(244, 63, 94, 0.14)' : 'rgba(16, 185, 129, 0.14)',
                          color: run.failedAttempts ? 'var(--red)' : 'var(--mint)',
                          border: run.failedAttempts ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
                        }}
                      >
                        {run.failedAttempts ? copy.statusFailed : copy.statusPassed}
                      </span>
                      <button
                        type="button"
                        className="button button-ghost"
                        title={copy.deleteRun}
                        aria-label={copy.deleteRun}
                        disabled={Boolean(deletingRunId)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteRunHistory(run.mergedIds && run.mergedIds.length > 1 ? run.mergedIds : run.id);
                        }}
                        style={{
                          minHeight: '24px',
                          padding: '2px 7px',
                          fontSize: '11px',
                          color: 'var(--red)',
                          borderColor: 'rgba(244, 63, 94, 0.3)',
                        }}
                      >
                        {deletingRunId === run.id ? '…' : '✕'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalRunPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderTop: '1px solid var(--line)',
            background: 'var(--panel-2)',
            fontSize: '12px',
            color: 'var(--muted)',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>
            {copy.pageLabel} {currentRunPage} / {totalRunPages} ({runStartIdx + 1}–{Math.min(runStartIdx + runsPageSize, processedRuns.length)} / {processedRuns.length})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="button button-ghost"
              disabled={currentRunPage <= 1}
              onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
              style={{ minHeight: '30px', padding: '4px 10px', fontSize: '11.5px' }}
            >
              {copy.prevPage}
            </button>
            {Array.from({ length: totalRunPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={pageNum === currentRunPage ? 'button button-primary' : 'button button-ghost'}
                onClick={() => setRunsPage(pageNum)}
                style={{ minHeight: '30px', padding: '4px 10px', fontSize: '11.5px', minWidth: '30px' }}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              className="button button-ghost"
              disabled={currentRunPage >= totalRunPages}
              onClick={() => setRunsPage((p) => Math.min(totalRunPages, p + 1))}
              style={{ minHeight: '30px', padding: '4px 10px', fontSize: '11.5px' }}
            >
              {copy.nextPage}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <Navbar
        repo={repo}
        token={token}
        locale={locale}
        labels={copy}
        status={status}
        isConnected={isConnected}
        isConnecting={isConnecting}
        isOpen={sidebarOpen}
        activeSection={activeSection}
        runsCount={totalRunsCount}
        flakesCount={flakes.length}
        onSectionChange={(sec) => {
          setActiveSection(sec);
          if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            setSidebarOpen(false);
          }
        }}
        onRepoChange={setRepo}
        onTokenChange={setToken}
        onLocaleChange={handleLocaleChange}
        onConnect={() => void connectWorkspace(repo, token)}
        onDisconnect={disconnectWorkspace}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        {/* SNYK-STYLE TOP PROJECT HEADER + HORIZONTAL SECTION TABS */}
        <header className="project-topbar">
          <div className="project-topbar-row">
            <div className="project-topbar-left">
              <button
                type="button"
                className="sidebar-hamburger-btn"
                aria-label="Toggle navigation menu"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen((prev) => !prev)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div>
                <div className="breadcrumb-trail">
                  <span>{copy.projectsBreadcrumb}</span>
                  <span className="crumb-sep">›</span>
                  <span>{repo.split('/')[0] || copy.workspace}</span>
                  <span className="crumb-sep">›</span>
                  <strong>{repo.split('/')[1] || repo}</strong>
                </div>
                <div className="project-title-group">
                  <h1>{repo}</h1>
                  <span className="branch-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    {activeBranch}
                  </span>
                </div>
              </div>
            </div>

            <div className="top-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void openRunDetails('all')}
              >
                <span>{copy.viewAllCombined} ({summary.totalAttempts ?? 0})</span>
                <span>⧉</span>
              </button>
              <span className="live-chip">
                <i /> {summary.windowLabel ?? copy.liveData}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={copy.exportJson}
                title={copy.exportJson}
                onClick={() => void exportReportJson()}
              >
                ↓ JSON
              </button>
              <button type="button" className="account-chip" onClick={() => setAccountModal(true)}>
                <span className="account-avatar">
                  {(account?.displayName ?? account?.email ?? 'A').slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{account?.displayName ?? copy.account}</strong>
                  <small>{account?.email ?? copy.connected}</small>
                </span>
              </button>
            </div>
          </div>

          {/* Horizontal Tab Bar (Snyk Project View Tabs) */}
          <div className="project-tabs" role="tablist" aria-label={copy.workspace}>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'overview'}
              className={`project-tab ${activeSection === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveSection('overview')}
            >
              <span>{copy.tabOverview}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'history'}
              className={`project-tab ${activeSection === 'history' ? 'active' : ''}`}
              onClick={() => setActiveSection('history')}
            >
              <span>{copy.tabHistory}</span>
              <span className="project-tab-count">{totalRunsCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'flakes'}
              className={`project-tab ${activeSection === 'flakes' ? 'active' : ''}`}
              onClick={() => setActiveSection('flakes')}
            >
              <span>{copy.tabFlakes}</span>
              <span className="project-tab-count">{flakes.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'cost'}
              className={`project-tab ${activeSection === 'cost' ? 'active' : ''}`}
              onClick={() => setActiveSection('cost')}
            >
              <span>{copy.tabCostArtifacts}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'settings'}
              className={`project-tab ${activeSection === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveSection('settings')}
            >
              <span>{copy.tabSettings}</span>
            </button>
          </div>
        </header>

        {/* SNYK-STYLE 4-COLUMN METADATA SUMMARY STRIP */}
        <section className="project-meta-strip" aria-label={copy.analysisOverview}>
          <div className="meta-cell">
            <span className="meta-cell-label">{copy.metaConnectedBy}</span>
            <span className="meta-cell-value">
              {account?.displayName || account?.email || copy.connected}
            </span>
          </div>
          <div className="meta-cell">
            <span className="meta-cell-label">{copy.metaTestedWith}</span>
            <span className="meta-cell-value">{copy.metaTestedWithValue}</span>
          </div>
          <div className="meta-cell">
            <span className="meta-cell-label">{copy.metaTargetBranch}</span>
            <span className="meta-cell-value" style={{ fontFamily: 'var(--font-mono)' }}>
              {activeBranch} {activeCommitSha ? `· ${activeCommitSha.slice(0, 7)}` : ''}
            </span>
          </div>
          <div className="meta-cell">
            <span className="meta-cell-label">{copy.metaEnvironment}</span>
            <span className="meta-cell-value" style={{ color: 'var(--mint)' }}>
              ● {status || copy.liveGatewayConnected}
            </span>
          </div>
        </section>

        {/* SECTIONED TAB CONTENT AREA */}
        <div className="dashboard-content">
          {/* ================================================================
              TAB 1: OVERVIEW (KPI Strip + Snyk Split Filter/Results View)
              ================================================================ */}
          {activeSection === 'overview' && (
            <>
              <section className="metric-strip" id="overview">
                <div className="metric lead">
                  <span>{copy.healthScore}</span>
                  <strong>{summary.healthScore}%</strong>
                  <small>{copy.calculatedHistory}</small>
                  <div className="health-line">
                    <i style={{ width: `${Math.min(100, Math.max(0, summary.healthScore))}%` }} />
                  </div>
                </div>
                <StatsCard label={copy.activeFlakes} value={summary.activeFlakes} detail={copy.classifiedRuns} />
                <StatsCard label={copy.runnerWaste} value={formatTime(summary.wasteSeconds)} detail={copy.retries} />
                <StatsCard
                  label={copy.estimatedCost}
                  value={`$${summary.wasteUsd.toFixed(2)}`}
                  detail={
                    summary.runnerCostPerMinute
                      ? `${copy.atRate} $${summary.runnerCostPerMinute.toFixed(3)} ${copy.perRunnerMinute}`
                      : copy.calculatedHistory
                  }
                  accent
                />
              </section>

              <div className="snyk-split-layout">
                {/* Left Diagnostic Filter Rail (Snyk style) */}
                <aside className="filter-rail">
                  <div className="filter-rail-head">
                    <h3>{copy.filterSidebarTitle}</h3>
                    <button
                      type="button"
                      className="filter-reset-btn"
                      onClick={() => {
                        setSelectedCategories([]);
                        setRunStatusFilter('all');
                        setQuery('');
                      }}
                    >
                      {copy.filterReset}
                    </button>
                  </div>

                  <div className="filter-group">
                    <div className="filter-group-title">{copy.filterCategoryLabel}</div>
                    {[
                      { code: 'INTERMITTENT', label: copy.catIntermittent, color: 'var(--red)' },
                      { code: 'ENVIRONMENT', label: copy.catEnvSensitive, color: 'var(--amber)' },
                      { code: 'INFRASTRUCTURE', label: copy.catInfraFailure, color: 'var(--blue)' },
                      { code: 'DETERMINISTIC', label: copy.catDeterministic, color: 'var(--mint)' },
                    ].map((cat) => {
                      const count = flakes.filter((f) => f.category.toUpperCase().includes(cat.code)).length;
                      return (
                        <label key={cat.code} className="filter-check-row">
                          <span className="filter-check-left">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(cat.code)}
                              onChange={() => toggleCategoryFilter(cat.code)}
                            />
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: cat.color,
                                display: 'inline-block',
                              }}
                            />
                            <span>{cat.label}</span>
                          </span>
                          <span className="filter-pill-count">{count}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="filter-group">
                    <div className="filter-group-title">{copy.filterRunStatusLabel}</div>
                    {[
                      { id: 'all' as const, label: copy.filterAllRuns, count: summary.recentRuns?.length ?? 0 },
                      {
                        id: 'failed' as const,
                        label: copy.filterFailedRuns,
                        count: (summary.recentRuns ?? []).filter((r) => (r.failedAttempts ?? 0) > 0).length,
                      },
                      {
                        id: 'clean' as const,
                        label: copy.filterCleanRuns,
                        count: (summary.recentRuns ?? []).filter((r) => (r.failedAttempts ?? 0) === 0).length,
                      },
                    ].map((opt) => (
                      <label key={opt.id} className="filter-check-row">
                        <span className="filter-check-left">
                          <input
                            type="radio"
                            name="run-status-filter"
                            checked={runStatusFilter === opt.id}
                            onChange={() => {
                              setRunStatusFilter(opt.id);
                              setOverviewSubTab('runs');
                              setRunsPage(1);
                            }}
                          />
                          <span>{opt.label}</span>
                        </span>
                        <span className="filter-pill-count">{opt.count}</span>
                      </label>
                    ))}
                  </div>

                  <div className="filter-group">
                    <div className="filter-group-title">{copy.quickActionsTitle}</div>
                    <button
                      type="button"
                      className="button button-ghost full"
                      onClick={() => void openRunDetails('all')}
                    >
                      <span>{copy.viewAllCombined}</span>
                      <span>⧉</span>
                    </button>
                    <button
                      type="button"
                      className="button button-ghost full"
                      onClick={() => void exportReportCsv()}
                    >
                      <span>{copy.exportCsv}</span>
                      <span>↓</span>
                    </button>
                  </div>
                </aside>

                {/* Right Sub-Tabbed Workspace (Snyk Issues / Dependencies style) */}
                <section className="snyk-main-panel">
                  <div className="subtab-bar">
                    <div className="subtab-buttons">
                      <button
                        type="button"
                        className={`subtab-btn ${overviewSubTab === 'issues' ? 'active' : ''}`}
                        onClick={() => setOverviewSubTab('issues')}
                      >
                        <span>{copy.subTabFlakeIssues}</span>
                        <span className="project-tab-count">{filtered.length}</span>
                      </button>
                      <button
                        type="button"
                        className={`subtab-btn ${overviewSubTab === 'runs' ? 'active' : ''}`}
                        onClick={() => setOverviewSubTab('runs')}
                      >
                        <span>{copy.subTabRecentRuns}</span>
                        <span className="project-tab-count">{processedRuns.length}</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <input
                        className="search"
                        style={{ minWidth: '220px', padding: '7px 12px' }}
                        placeholder={copy.searchPlaceholder}
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setRunsPage(1);
                        }}
                      />
                      {overviewSubTab === 'issues' ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          style={{ minHeight: '34px', padding: '6px 12px' }}
                          onClick={() => setActiveSection('flakes')}
                        >
                          {copy.viewAllFlakes}
                        </button>
                      ) : (
                        <>
                          {totalRunsCount > 0 && (
                            <button
                              type="button"
                              className="button button-danger"
                              style={{ minHeight: '34px', padding: '6px 12px' }}
                              disabled={Boolean(deletingRunId)}
                              onClick={() => void deleteRunHistory('all')}
                            >
                              {deletingRunId === 'all' ? copy.deletingRun : `🗑 ${copy.clearHistory}`}
                            </button>
                          )}
                          <button
                            type="button"
                            className="button button-ghost"
                            style={{ minHeight: '34px', padding: '6px 12px' }}
                            onClick={() => setActiveSection('history')}
                          >
                            {copy.viewFullHistory}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {overviewSubTab === 'issues' ? (
                    <div>
                      {filtered.length === 0 ? (
                        <div className="empty" style={{ padding: '4rem 1.5rem' }}>
                          <div
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '50%',
                              background: 'rgba(16, 185, 129, 0.14)',
                              border: '1px solid rgba(52, 211, 153, 0.4)',
                              color: 'var(--mint)',
                              display: 'grid',
                              placeItems: 'center',
                              margin: '0 auto 14px',
                              fontSize: '20px',
                            }}
                          >
                            ✓
                          </div>
                          <strong style={{ display: 'block', fontSize: '16px', color: 'var(--fc-slate-50)', marginBottom: '6px' }}>
                            {copy.allTestsDeterministic}
                          </strong>
                          <p style={{ margin: '0 auto 18px', fontSize: '13px', color: 'var(--muted)', maxWidth: '460px' }}>
                            {copy.allTestsDeterministicDesc}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={() => void openRunDetails('all')}
                            >
                              {copy.viewAllCombined} ({summary.totalAttempts ?? 0} {copy.attempts.toLowerCase()}) ⧉
                            </button>
                            <button
                              type="button"
                              className="button button-ghost"
                              onClick={() => setOverviewSubTab('runs')}
                            >
                              {copy.subTabRecentRuns} ({totalRunsCount}) →
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {filtered.map((flake) => (
                            <button
                              type="button"
                              className={`flake-row ${selected?.testId === flake.testId ? 'selected' : ''}`}
                              key={flake.testId}
                              onClick={() => {
                                setSelected(flake);
                                void loadTimeline(flake.testId);
                                setActiveSection('flakes');
                              }}
                            >
                              <span className={`severity ${flake.category.toLowerCase().replaceAll('_', '-')}`} />
                              <span className="test-cell">
                                <strong>{flake.testName}</strong>
                                <small>{flake.filePath}</small>
                              </span>
                              <span className="category">{flake.category.replaceAll('_', ' ')}</span>
                              <span className="confidence">{flake.confidence}%</span>
                              <span className="arrow">→</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    renderRunsTable()
                  )}
                </section>
              </div>
            </>
          )}

          {/* ================================================================
              TAB 2: HISTORY & RUNS (Full Paginated Runs + Commit Grouping)
              ================================================================ */}
          {activeSection === 'history' && (
            <section className="cost-panel" style={{ width: '100%' }}>
              <div className="section-head" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '18px' }}>
                <div>
                  <h2>{copy.analysisOverview}</h2>
                  <p>
                    {copy.recentIngestedRuns} ({totalRunsCount} {copy.totalRunsAnalyzed.toLowerCase()} · {summary.totalAttempts ?? 0} {copy.attempts.toLowerCase()} · {summary.cleanTests ?? 0} {copy.cleanTests.toLowerCase()})
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    className="search"
                    style={{ minWidth: '210px', padding: '7px 12px' }}
                    placeholder={copy.searchPlaceholder}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setRunsPage(1);
                    }}
                  />
                  <button
                    type="button"
                    className={groupRunsByCommit ? 'button button-primary' : 'button button-ghost'}
                    onClick={() => {
                      setGroupRunsByCommit((prev) => !prev);
                      setRunsPage(1);
                    }}
                  >
                    {groupRunsByCommit ? copy.allRunsView : copy.groupByCommit}
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void openRunDetails('all')}
                  >
                    {copy.viewAllCombined} ({summary.totalAttempts ?? 0}) ⧉
                  </button>
                  {totalRunsCount > 0 && (
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={Boolean(deletingRunId)}
                      onClick={() => void deleteRunHistory('all')}
                    >
                      {deletingRunId === 'all' ? copy.deletingRun : `🗑 ${copy.clearHistory}`}
                    </button>
                  )}
                </div>
              </div>
              {renderRunsTable()}
            </section>
          )}

          {/* ================================================================
              TAB 3: FLAKE ISSUES & EVIDENCE MASTER-DETAIL
              ================================================================ */}
          {activeSection === 'flakes' && (
            <section className="workspace" id="flakes">
              <FlakeList
                flakes={filtered}
                selected={selected}
                query={query}
                labels={copy}
                activeBranch={activeBranch}
                onQueryChange={setQuery}
                onSelect={(flake) => {
                  setSelected(flake);
                  void loadTimeline(flake.testId);
                }}
                onExport={() => void exportReportCsv()}
              />
              <EvidenceCard
                selected={selected}
                api={api}
                timeline={timeline}
                labels={copy}
                setStatus={setStatus}
                onTimelineLoad={() =>
                  selected
                    ? loadTimeline(selected.testId).then(() => setStatus(copy.timelineLoaded))
                    : Promise.resolve()
                }
                onQuarantine={() => setModal(true)}
              />
            </section>
          )}

          {/* ================================================================
              TAB 4: COST IMPACT & CI ARTIFACTS
              ================================================================ */}
          {activeSection === 'cost' && (
            <>
              <section className="metric-strip">
                <StatsCard
                  label={copy.estimatedCost}
                  value={`$${summary.wasteUsd.toFixed(2)}`}
                  detail={copy.costBreakdownDesc}
                  accent
                />
                <StatsCard
                  label={copy.wastedComputeTime}
                  value={formatTime(summary.wasteSeconds)}
                  detail={copy.retries}
                />
                <StatsCard
                  label={copy.activeRunnerRate}
                  value={`$${(summary.runnerCostPerMinute ?? 0.008).toFixed(3)}/m`}
                  detail={copy.perRunnerMinute}
                />
                <StatsCard
                  label={copy.cleanPassRatio}
                  value={`${summary.healthScore}%`}
                  detail={`${summary.cleanTests ?? 0} ${copy.cleanTests.toLowerCase()}`}
                />
              </section>

              <section className="bottom-grid" id="cost">
                <div className="cost-panel" style={{ padding: '22px' }}>
                  <div className="section-head" style={{ padding: '0 0 16px' }}>
                    <div>
                      <h2>{copy.costBreakdownTitle}</h2>
                      <p>{copy.costBreakdownDesc}</p>
                    </div>
                    <span className="period">{summary.windowLabel ?? copy.liveData}</span>
                  </div>
                  <div className="cost-number" style={{ padding: '12px 0' }}>
                    ${summary.wasteUsd.toFixed(2)} <small>{copy.estimatedWaste}</small>
                  </div>
                  <div
                    style={{
                      marginTop: '18px',
                      padding: '16px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--panel-2)',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      gap: '10px',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>{copy.totalRunsAnalyzed}</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{totalRunsCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>{copy.attempts}</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{summary.totalAttempts ?? 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>{copy.activeFlakes}</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{summary.activeFlakes}</strong>
                    </div>
                  </div>
                </div>

                <div className="export-panel" id="exports">
                  <h2>{copy.artifacts}</h2>
                  <p>{copy.exportDescription}</p>
                  <div className="artifact-actions">
                    <button type="button" onClick={() => setStatus(copy.jestRequested)}>
                      <span>{copy.jestSkipList}</span>
                      <span>⧉</span>
                    </button>
                    <button type="button" onClick={() => setStatus(copy.playwrightRequested)}>
                      <span>{copy.playwrightSkipList}</span>
                      <span>⧉</span>
                    </button>
                    <button type="button" onClick={() => void exportReportJson()}>
                      <span>{copy.exportJson}</span>
                      <span>↓</span>
                    </button>
                    <button type="button" onClick={() => void exportReportCsv()}>
                      <span>{copy.exportCsv}</span>
                      <span>↓</span>
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================
              TAB 5: PROJECT & ACCOUNT SETTINGS (Snyk Settings Tab)
              ================================================================ */}
          {activeSection === 'settings' && (
            <div className="bottom-grid">
              <section className="export-panel">
                <span className="eyebrow">{copy.workspace}</span>
                <h2 style={{ marginTop: '6px' }}>{copy.switchRepoTitle}</h2>
                <p>{copy.switchRepoDesc}</p>

                <div className="settings-section" style={{ marginTop: '16px' }}>
                  <label className="field-label" htmlFor="settings-repo">{copy.repository}</label>
                  <input
                    id="settings-repo"
                    className="input"
                    placeholder={copy.repoPlaceholder}
                    value={repo}
                    onChange={(event) => {
                      setRepo(event.target.value);
                      setRepositoryTokenConfigured(false);
                    }}
                  />
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={isConnecting || !repo.trim()}
                      onClick={() => void connectWorkspace(repo, token)}
                    >
                      {isConnecting ? copy.connecting : copy.connect} ↗
                    </button>
                    {isConnected && (
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={disconnectWorkspace}
                      >
                        {copy.disconnect} ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-section" style={{ marginTop: '18px' }}>
                  <div className="settings-row">
                    <span className="field-label">{copy.tokenStatus}</span>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => void loadRepositoryTokenStatus()}
                    >
                      {copy.refresh}
                    </button>
                  </div>
                  {repositoryTokenConfigured ? (
                    <>
                      <p className="field-help">{copy.tokenMasked}</p>
                      <div className="token-controls">
                        <input
                          className="input"
                          type="password"
                          value="flakecheck-token-configured"
                          readOnly
                          aria-label={copy.tokenMasked}
                        />
                        <button type="button" className="button button-ghost" onClick={copyOrRegenerateRepositoryToken}>
                          {copy.copyToken}
                        </button>
                        <button type="button" className="button button-ghost" onClick={() => void createRepositoryToken()}>
                          {copy.regenerateToken}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="button button-primary" onClick={() => void createRepositoryToken()}>
                      {copy.projectToken} +
                    </button>
                  )}
                </div>
              </section>

              <section className="export-panel">
                <span className="eyebrow">{copy.settings}</span>
                <h2 style={{ marginTop: '6px' }}>{account?.displayName ?? copy.account}</h2>
                <p>{account?.email ?? copy.accountDescription}</p>

                <div className="settings-section" style={{ marginTop: '16px' }}>
                  <label className="field-label" htmlFor="inline-display-name">{copy.displayName}</label>
                  <input
                    id="inline-display-name"
                    className="input"
                    value={account?.displayName ?? ''}
                    onChange={(event) =>
                      setAccount((current) => (current ? { ...current, displayName: event.target.value } : current))
                    }
                  />
                </div>

                <div className="settings-section" style={{ marginTop: '14px' }}>
                  <div className="settings-row">
                    <span className="field-label">{copy.github}</span>
                    <strong className="settings-value">
                      {account?.githubConnected ? copy.connected : copy.notConnected}
                    </strong>
                  </div>
                  {!account?.githubConnected && (
                    <a
                      className="button button-github full"
                      href={apiUrl('/api/auth/github')}
                      onClick={(event) => {
                        event.preventDefault();
                        void startOAuth('github');
                      }}
                    >
                      <span>{copy.connectGithub}</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>

                <div className="modal-actions account-modal-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() =>
                      fetch(apiUrl('/api/account/profile'), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        credentials: 'include',
                        body: JSON.stringify({ displayName: account?.displayName ?? '', locale }),
                      })
                        .then(async (response) => {
                          if (!response.ok) throw friendlyResponseError(response, copy.saveSettingsError);
                          setStatus(copy.saved);
                        })
                        .catch((error) => setStatus(userFacingMessage(error, copy.saveSettingsError)))
                    }
                  >
                    {copy.save}
                  </button>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => {
                      setSessionToken(null);
                      fetch(apiUrl('/api/auth/logout'), {
                        method: 'POST',
                        credentials: 'include',
                        headers: { ...authHeaders() },
                      }).finally(() => window.location.replace('/login'));
                    }}
                  >
                    {copy.signOut}
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() =>
                      fetch(apiUrl('/api/account/delete'), {
                        method: 'DELETE',
                        credentials: 'include',
                        headers: { ...authHeaders() },
                      })
                        .then(async (response) => {
                          if (!response.ok) throw friendlyResponseError(response, copy.deleteAccountConfirm);
                          setSessionToken(null);
                          setStatus(copy.accountDeleted);
                        })
                        .catch((error) => setStatus(userFacingMessage(error, copy.deleteAccountConfirm)))
                    }
                  >
                    {copy.deleteAccount}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {modal && selected && (
        <QuarantineModal
          testName={selected.testName}
          reason={reason}
          labels={copy}
          onReasonChange={setReason}
          onClose={() => setModal(false)}
          onConfirm={() => quarantine(true)}
        />
      )}

      {accountModal && (
        <div className="modal-backdrop" onClick={() => setAccountModal(false)}>
          <div
            className="modal account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close account-modal-close"
              onClick={() => setAccountModal(false)}
              aria-label={copy.close}
            >
              ×
            </button>
            <span className="eyebrow">{copy.settings}</span>
            <h2 id="account-settings-title">{account?.displayName ?? copy.account}</h2>
            <p className="account-email">{account?.email ?? '—'}</p>
            <div className="settings-section">
              <label className="field-label" htmlFor="account-display-name">
                {copy.displayName}
              </label>
              <input
                id="account-display-name"
                className="input"
                value={account?.displayName ?? ''}
                onChange={(event) =>
                  setAccount((current) => (current ? { ...current, displayName: event.target.value } : current))
                }
              />
            </div>
            <div className="settings-section">
              <div className="settings-row">
                <span className="field-label">{copy.github}</span>
                <strong className="settings-value">
                  {account?.githubConnected ? copy.connected : copy.notConnected}
                </strong>
              </div>
              {!account?.githubConnected && (
                <a
                  className="button button-github full"
                  href={apiUrl('/api/auth/github')}
                  onClick={(event) => {
                    event.preventDefault();
                    void startOAuth('github');
                  }}
                >
                  <svg className="github-logo" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1.01.07 1.54 1.04 1.54 1.04.9 1.54 2.35 1.1 2.92.84.09-.65.35-1.1.63-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 7.99c.85 0 1.7.11 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.33 4.69-4.56 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
                    />
                  </svg>
                  {copy.connectGithub} <span>↗</span>
                </a>
              )}
            </div>
            <div className="settings-section">
              <label className="field-label" htmlFor="token-repo">{copy.repository}</label>
              <input
                id="token-repo"
                className="input"
                placeholder={copy.repoPlaceholder}
                value={repo}
                onChange={(event) => {
                  setRepo(event.target.value);
                  setRepositoryTokenConfigured(false);
                }}
              />
              <button
                type="button"
                className="button button-ghost settings-status-button"
                onClick={() => void loadRepositoryTokenStatus()}
              >
                {copy.tokenStatus}
              </button>
              {repositoryTokenConfigured ? (
                <>
                  <p className="field-help">{copy.tokenMasked}</p>
                  <div className="token-controls">
                    <input
                      className="input"
                      type="password"
                      value="flakecheck-token-configured"
                      readOnly
                      aria-label={copy.tokenMasked}
                    />
                    <button type="button" className="button button-ghost" onClick={copyOrRegenerateRepositoryToken}>
                      {copy.copyToken}
                    </button>
                    <button type="button" className="button button-ghost" onClick={() => void createRepositoryToken()}>
                      {copy.regenerateToken}
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="button button-ghost" onClick={() => void createRepositoryToken()}>
                  {copy.projectToken} +
                </button>
              )}
            </div>
            <div className="modal-actions account-modal-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() =>
                  fetch(apiUrl('/api/account/profile'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    credentials: 'include',
                    body: JSON.stringify({ displayName: account?.displayName ?? '', locale }),
                  })
                    .then(async (response) => {
                      if (!response.ok) throw friendlyResponseError(response, copy.saveSettingsError);
                      setStatus(copy.saved);
                    })
                    .catch((error) => setStatus(userFacingMessage(error, copy.saveSettingsError)))
                }
              >
                {copy.save}
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => {
                  setSessionToken(null);
                  fetch(apiUrl('/api/auth/logout'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { ...authHeaders() },
                  }).finally(() => window.location.replace('/login'));
                }}
              >
                {copy.signOut}
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() =>
                  fetch(apiUrl('/api/account/delete'), {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: { ...authHeaders() },
                  })
                    .then(async (response) => {
                      if (!response.ok) throw friendlyResponseError(response, copy.deleteAccountConfirm);
                      setSessionToken(null);
                      setStatus(copy.accountDeleted);
                      setAccountModal(false);
                    })
                    .catch((error) => setStatus(userFacingMessage(error, copy.deleteAccountConfirm)))
                }
              >
                {copy.deleteAccount}
              </button>
            </div>
            <p className="modal-links">
              <a href="/terms">{copy.terms}</a> · <a href="/privacy">{copy.privacy}</a>
            </p>
          </div>
        </div>
      )}

      {createdToken && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal token-created-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-created-title"
          >
            <button
              type="button"
              className="modal-close account-modal-close"
              onClick={() => {
                setCreatedToken('');
                setTokenCopied(false);
              }}
              aria-label={copy.close}
            >
              ×
            </button>
            <span className="eyebrow">{copy.projectToken}</span>
            <h2 id="token-created-title">{copy.tokenCreated}</h2>
            <p>{copy.tokenCreatedBody}</p>
            <code className="created-token">{createdToken}</code>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-primary copy-token-button"
                onClick={() => void copyRepositoryToken()}
              >
                {tokenCopied ? copy.copied : copy.copyToken} <span>⧉</span>
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => {
                  setCreatedToken('');
                  setTokenCopied(false);
                }}
              >
                {copy.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRunId && (
        <RunDetailsModal
          runId={selectedRunId}
          details={runDetails}
          loading={loadingRunDetails}
          error={runDetailsError}
          labels={copy}
          locale={locale}
          defaultBranch={activeBranch}
          defaultCommitSha={activeCommitSha}
          deletingRunId={deletingRunId}
          onDeleteRun={deleteRunHistory}
          onClose={() => {
            setSelectedRunId(null);
            setRunDetails(null);
            setRunDetailsError(null);
          }}
        />
      )}
    </div>
  );
}
