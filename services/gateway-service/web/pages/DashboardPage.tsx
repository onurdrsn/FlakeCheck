import { useEffect, useMemo, useState } from 'react';
import { translations, type Locale } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useFlakes } from '../hooks/useFlakes';
import { EvidenceCard } from '../components/EvidenceCard';
import { FlakeList } from '../components/FlakeList';
import { Navbar } from '../components/Navbar';
import { QuarantineModal } from '../components/QuarantineModal';
import { StatsCard } from '../components/StatsCard';
import { WorkspaceConnector } from '../components/WorkspaceConnector';
import type { Flake } from '../types';
import { friendlyResponseError, userFacingMessage } from '../http';

const WORKSPACE_REPOSITORY_KEY = 'flakecheck.workspace.repository';

function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`; }
function downloadJson(data: unknown) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'flakecheck-report.json'; anchor.click(); URL.revokeObjectURL(url); }
function downloadCsv(data: Flake[]) { const csv = ['testId,category,confidence,filePath', ...data.map((item) => [item.testId, item.category, item.confidence, item.filePath].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'flakecheck-report.csv'; anchor.click(); URL.revokeObjectURL(url); }

export function DashboardPage() {
  const [locale, setLocale] = useState<Locale>('en');
  const [repo, setRepo] = useState(() => window.localStorage.getItem(WORKSPACE_REPOSITORY_KEY) ?? '');
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
  const { api, connect, status, setStatus } = useAuth(repo, token);
  const { summary, flakes, selected, setSelected, timeline, load, loadTimeline } = useFlakes(api);
  const copy = translations[locale];
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me', { credentials: 'include' }),
      fetch('/api/account/repositories', { credentials: 'include' }),
    ]).then(async ([accountResponse, repositoriesResponse]) => {
      if (accountResponse.ok) setAccount(await accountResponse.json() as { email: string | null; displayName: string | null; githubConnected?: boolean });
      if (repositoriesResponse.ok) {
        const data = await repositoriesResponse.json() as { repositories?: string[] };
        const serverRepo = data.repositories?.[0];
        if (serverRepo) {
          setRepo(serverRepo);
          window.localStorage.setItem(WORKSPACE_REPOSITORY_KEY, serverRepo);
          setPendingConnect(true);
        }
      }
    }).catch(() => undefined).finally(() => setBootstrapping(false));
  }, []);
  useEffect(() => {
    if (bootstrapping || !pendingConnect || !repo) return;
    void connect(load).catch(() => undefined).finally(() => setPendingConnect(false));
  }, [bootstrapping, pendingConnect, repo, token, connect, load]);
  useEffect(() => {
    if (accountModal) void loadRepositoryTokenStatus();
  }, [accountModal, repo]);
  const filtered = useMemo(() => flakes.filter((flake) => `${flake.filePath} ${flake.testName} ${flake.category}`.toLowerCase().includes(query.toLowerCase())), [flakes, query]);
  const connectWorkspace = (nextRepo = repo, nextToken = token) => {
    const normalizedRepo = nextRepo.trim();
    if (!normalizedRepo) return;
    window.localStorage.setItem(WORKSPACE_REPOSITORY_KEY, normalizedRepo);
    setRepo(normalizedRepo);
    setToken(nextToken);
    setPendingConnect(true);
  };
  async function quarantine(state: boolean) {
    if (!selected) return;
    try { await api('/api/quarantine', { method: 'POST', body: JSON.stringify({ testId: selected.testId, state, reason }) }); setStatus(state ? `${selected.testName} moved to quarantine` : `${selected.testName} graduated from quarantine`); setModal(false); setReason(''); }
    catch (error) { setStatus(userFacingMessage(error, 'We could not update quarantine. Please try again.')); }
  }
  async function createRepositoryToken() {
    try {
      const response = await fetch('/api/account/repository-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repo }),
      });
      if (!response.ok) throw friendlyResponseError(response, 'We could not create a repository token.');
      const result = await response.json() as { token: string };
      setCreatedToken(result.token);
      setRepositoryTokenConfigured(true);
      setTokenCopied(false);
      setStatus(copy.tokenCreated);
    } catch (error) {
      setStatus(userFacingMessage(error, 'We could not create a repository token.'));
    }
  }
  async function loadRepositoryTokenStatus() {
    if (!repo) return;
    const response = await fetch(`/api/account/repository-token?repo=${encodeURIComponent(repo)}`, { credentials: 'include' });
    if (response.ok) setRepositoryTokenConfigured((await response.json() as { configured: boolean }).configured);
  }
  async function copyRepositoryToken() {
    try {
      await navigator.clipboard.writeText(createdToken);
      setTokenCopied(true);
    } catch {
      setStatus('Copy is unavailable in this browser. Select the token and copy it manually.');
    }
  }
  function copyOrRegenerateRepositoryToken() {
    if (createdToken) {
      void copyRepositoryToken();
    } else {
      void createRepositoryToken();
    }
  }
  if (bootstrapping || (pendingConnect && !summary)) return <div className="app-shell"><main className="main connector-main"><div className="connector-panel"><span className="eyebrow">{copy.workspace}</span><h1>{copy.connectTitle}</h1><p>{status}</p></div></main></div>;
  if (!summary) return <div className="app-shell"><aside className="sidebar connector-sidebar"><div className="brand"><span className="brand-mark">FC</span><div><strong>FlakeCheck</strong><small>CI reliability control</small></div></div><div className="side-footer"><span className="status-dot" /> Gateway online<small>{status}</small></div></aside><main className="main connector-main"><WorkspaceConnector locale={locale} onConnect={connectWorkspace} /></main></div>;
  return <div className="app-shell">
    <Navbar repo={repo} token={token} locale={locale} labels={{ workspace: copy.workspace, repository: copy.repository, token: copy.projectToken, tokenHint: copy.tokenHint, workspaceHelp: copy.connectDescription, connect: copy.connect, connectGithub: copy.connectGithub, language: copy.language, overview: copy.overview, flakes: copy.flakes }} activeFlakes={summary.activeFlakes} status={status} onRepoChange={setRepo} onTokenChange={setToken} onLocaleChange={setLocale} onConnect={connectWorkspace} />
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">{copy.workspace} / {repo}</p><h1>{copy.connectTitle}</h1></div><div className="top-actions"><span className="live-chip"><i /> {summary.windowLabel ?? copy.liveData}</span><button className="icon-button" aria-label="Export JSON" onClick={() => downloadJson(flakes)}>↓</button><button className="account-chip" onClick={() => setAccountModal(true)}><span className="account-avatar">{(account?.displayName ?? account?.email ?? 'A').slice(0, 1).toUpperCase()}</span><span><strong>{account?.displayName ?? copy.account}</strong><small>{account?.email ?? copy.connected}</small></span></button></div></header>
      <section className="metric-strip" id="overview"><div className="metric lead"><span>{copy.healthScore}</span><strong>{summary.healthScore}</strong><small>{copy.calculatedHistory}</small><div className="health-line"><i style={{ width: `${Math.min(100, Math.max(0, summary.healthScore))}%` }} /></div></div><StatsCard label={copy.activeFlakes} value={summary.activeFlakes} detail={copy.classifiedRuns} /><StatsCard label={copy.runnerWaste} value={formatTime(summary.wasteSeconds)} detail={copy.retries} /><StatsCard label={copy.estimatedCost} value={`$${summary.wasteUsd.toFixed(2)}`} detail={summary.runnerCostPerMinute ? `At $${summary.runnerCostPerMinute.toFixed(3)} per runner minute` : copy.calculatedHistory} accent /></section>
      <section className="workspace" id="flakes"><FlakeList flakes={filtered} selected={selected} query={query} onQueryChange={setQuery} onSelect={(flake) => { setSelected(flake); void loadTimeline(flake.testId); }} onExport={() => downloadCsv(filtered)} /><EvidenceCard selected={selected} api={api} timeline={timeline} setStatus={setStatus} onTimelineLoad={() => selected ? loadTimeline(selected.testId).then(() => setStatus('Timeline loaded')) : Promise.resolve()} onQuarantine={() => setModal(true)} /></section>
      <section className="bottom-grid" id="cost"><div className="cost-panel"><div className="section-head"><div><h2>{copy.costImpact}</h2><p>{copy.exportDescription}</p></div><span className="period">{summary.windowLabel ?? copy.liveData}</span></div><div className="cost-number">${summary.wasteUsd.toFixed(2)} <small>{copy.estimatedWaste}</small></div></div><div className="export-panel" id="exports"><h2>{copy.artifacts}</h2><p>{copy.exportDescription}</p><div className="artifact-actions"><button onClick={() => setStatus('Jest skip-list requested')}>Jest skip-list <span>⧉</span></button><button onClick={() => setStatus('Playwright skip-list requested')}>Playwright skip-list <span>⧉</span></button></div></div></section>
    </main>
    {modal && selected && <QuarantineModal testName={selected.testName} reason={reason} onReasonChange={setReason} onClose={() => setModal(false)} onConfirm={() => quarantine(true)} />}
    {accountModal && <div className="modal-backdrop" onClick={() => setAccountModal(false)}><div className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-settings-title" onClick={(event) => event.stopPropagation()}><button className="modal-close account-modal-close" onClick={() => setAccountModal(false)} aria-label={copy.close}>×</button><span className="eyebrow">{copy.settings}</span><h2 id="account-settings-title">{account?.displayName ?? copy.account}</h2><p className="account-email">{account?.email ?? '—'}</p><div className="settings-section"><label className="field-label" htmlFor="account-display-name">{copy.displayName}</label><input id="account-display-name" className="input" value={account?.displayName ?? ''} onChange={(event) => setAccount((current) => current ? { ...current, displayName: event.target.value } : current)} /></div><div className="settings-section"><div className="settings-row"><span className="field-label">{copy.github}</span><strong className="settings-value">{account?.githubConnected ? copy.connected : copy.notConnected}</strong></div>{!account?.githubConnected && <a className="button button-github full" href="/api/auth/github"><svg className="github-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1.01.07 1.54 1.04 1.54 1.04.9 1.54 2.35 1.1 2.92.84.09-.65.35-1.1.63-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 7.99c.85 0 1.7.11 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.33 4.69-4.56 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>{copy.connectGithub} <span>↗</span></a>}</div><div className="settings-section"><label className="field-label" htmlFor="token-repo">{copy.repository}</label><input id="token-repo" className="input" placeholder="owner/name" value={repo} onChange={(event) => { setRepo(event.target.value); setRepositoryTokenConfigured(false); }} /><button className="button button-ghost settings-status-button" onClick={() => void loadRepositoryTokenStatus()}>{copy.tokenStatus}</button>{repositoryTokenConfigured ? <><p className="field-help">{copy.tokenMasked}</p><div className="token-controls"><input className="input" type="password" value="flakecheck-token-configured" readOnly aria-label={copy.tokenMasked} />    <button className="button button-ghost" onClick={copyOrRegenerateRepositoryToken}>{copy.copyToken}</button><button className="button button-ghost" onClick={() => void createRepositoryToken()}>{copy.regenerateToken}</button></div></> : <button className="button button-ghost" onClick={() => void createRepositoryToken()}>{copy.projectToken} +</button>}</div><div className="modal-actions account-modal-actions"><button className="button button-primary" onClick={() => fetch('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ displayName: account?.displayName ?? '', locale }) }).then(async (response) => { if (!response.ok) throw friendlyResponseError(response, 'We could not save your account settings.'); setStatus(copy.saved); }).catch((error) => setStatus(userFacingMessage(error, 'We could not save your account settings.')))}>{copy.save}</button><button className="button button-ghost" onClick={() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => window.location.replace('/login'))}>{copy.signOut}</button><button className="button button-danger" onClick={() => fetch('/api/account/delete', { method: 'DELETE' }).then(async (response) => { if (!response.ok) throw friendlyResponseError(response, 'We could not delete your account. Please try again.'); setStatus('Account deleted'); setAccountModal(false); }).catch((error) => setStatus(userFacingMessage(error, 'We could not delete your account.')))}>{copy.deleteAccount}</button></div><p className="modal-links"><a href="/terms">{copy.terms}</a> · <a href="/privacy">{copy.privacy}</a></p></div></div>}
    {createdToken && <div className="modal-backdrop" role="presentation"><div className="modal token-created-modal" role="dialog" aria-modal="true" aria-labelledby="token-created-title"><button className="modal-close account-modal-close" onClick={() => { setCreatedToken(''); setTokenCopied(false); }} aria-label={copy.close}>×</button><span className="eyebrow">{copy.projectToken}</span><h2 id="token-created-title">{copy.tokenCreated}</h2><p>{copy.tokenCreatedBody}</p><code className="created-token">{createdToken}</code><div className="modal-actions"><button className="button button-primary copy-token-button" onClick={() => void copyRepositoryToken()}>{tokenCopied ? copy.copied : copy.copyToken} <span>⧉</span></button><button className="button button-ghost" onClick={() => { setCreatedToken(''); setTokenCopied(false); }}>{copy.close}</button></div></div></div>}
  </div>;
}
