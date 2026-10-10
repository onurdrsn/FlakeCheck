import { useEffect, useMemo, useState } from 'react';
import { translations, getStoredLocale, setStoredLocale, type Locale } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useFlakes } from '../hooks/useFlakes';
import { EvidenceCard } from '../components/EvidenceCard';
import { FlakeList } from '../components/FlakeList';
import { Navbar } from '../components/Navbar';
import { QuarantineModal } from '../components/QuarantineModal';
import { StatsCard } from '../components/StatsCard';
import { WorkspaceConnector } from '../components/WorkspaceConnector';
import type { Flake } from '../types';
import { apiUrl, authHeaders, friendlyResponseError, setSessionToken, userFacingMessage } from '../http';

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

function downloadCsv(data: Flake[]) {
  const csv = [
    'testId,category,confidence,filePath',
    ...data.map((item) =>
      [item.testId, item.category, item.confidence, item.filePath]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'flakecheck-report.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale());
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

  const copy = translations[locale];
  const { api, connect, status, setStatus } = useAuth(repo, token);
  const { summary, flakes, selected, setSelected, setSummary, setFlakes, timeline, load, loadTimeline } = useFlakes(api);

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
    if (accountModal) void loadRepositoryTokenStatus();
  }, [accountModal, repo]);

  const filtered = useMemo(
    () => flakes.filter((flake) => `${flake.filePath} ${flake.testName} ${flake.category}`.toLowerCase().includes(query.toLowerCase())),
    [flakes, query],
  );

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
          <div className="brand">
            <span className="brand-mark">FC</span>
            <div>
              <strong>{copy.brandTitle}</strong>
              <small>{copy.brandTagline}</small>
            </div>
          </div>
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
        onRepoChange={(newRepo) => {
          setRepo(newRepo);
        }}
        onTokenChange={setToken}
        onLocaleChange={handleLocaleChange}
        onConnect={() => void connectWorkspace(repo, token)}
        onDisconnect={disconnectWorkspace}
      />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{copy.workspace} / {repo}</p>
            <h1>{copy.connectTitle}</h1>
          </div>
          <div className="top-actions">
            <span className="live-chip">
              <i /> {summary.windowLabel ?? copy.liveData}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={copy.exportJson}
              onClick={() => downloadJson(flakes)}
            >
              ↓
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
        </header>
        <section className="metric-strip" id="overview">
          <div className="metric lead">
            <span>{copy.healthScore}</span>
            <strong>{summary.healthScore}</strong>
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
        <section className="workspace" id="flakes">
          <FlakeList
            flakes={filtered}
            selected={selected}
            query={query}
            labels={copy}
            onQueryChange={setQuery}
            onSelect={(flake) => {
              setSelected(flake);
              void loadTimeline(flake.testId);
            }}
            onExport={() => downloadCsv(filtered)}
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
        <section className="bottom-grid" id="cost">
          <div className="cost-panel">
            <div className="section-head">
              <div>
                <h2>{copy.costImpact}</h2>
                <p>{copy.exportDescription}</p>
              </div>
              <span className="period">{summary.windowLabel ?? copy.liveData}</span>
            </div>
            <div className="cost-number">
              ${summary.wasteUsd.toFixed(2)} <small>{copy.estimatedWaste}</small>
            </div>
          </div>
          <div className="export-panel" id="exports">
            <h2>{copy.artifacts}</h2>
            <p>{copy.exportDescription}</p>
            <div className="artifact-actions">
              <button type="button" onClick={() => setStatus(copy.jestRequested)}>
                {copy.jestSkipList} <span>⧉</span>
              </button>
              <button type="button" onClick={() => setStatus(copy.playwrightRequested)}>
                {copy.playwrightSkipList} <span>⧉</span>
              </button>
            </div>
          </div>
        </section>
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
                <a className="button button-github full" href={apiUrl('/api/auth/github')}>
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
    </div>
  );
}
