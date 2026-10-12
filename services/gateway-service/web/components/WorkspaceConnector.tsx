import { useEffect, useMemo, useState } from 'react';
import { apiUrl, authHeaders, startOAuth } from '../http';
import type { Locale } from '../i18n';
import { translations } from '../i18n';
import { toast } from '../toast';
import { CustomDropdown } from './CustomDropdown';

type Repository = { fullName: string; visibility: 'public' | 'private'; defaultBranch?: string };

export function WorkspaceConnector({
  onConnect,
  locale = 'en',
  initialStep = 'visibility',
  currentRepo = '',
  recentRepos = [],
  onCancel,
}: {
  onConnect: (repo: string, token: string) => void;
  locale?: Locale;
  initialStep?: 'visibility' | 'public' | 'github';
  currentRepo?: string;
  recentRepos?: string[];
  onCancel?: () => void;
}) {
  const copy = translations[locale];
  const [step, setStep] = useState<'visibility' | 'public' | 'github'>(initialStep);
  const [repo, setRepo] = useState('');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(currentRepo || '');
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [collapsedOwners, setCollapsedOwners] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const connectRepository = (repository: string, projectToken: string) => {
    if (!repository.trim()) return;
    onConnect(repository.trim(), projectToken);
  };

  async function loadRepositories() {
    setError('');
    setStep('github');
    setLoadingRepos(true);
    try {
      const response = await fetch(apiUrl('/api/github/repos'), {
        credentials: 'include',
        headers: { ...authHeaders() },
      });
      if (!response.ok) {
        setError(copy.connectGithubFirst);
        toast.warning(copy.github, copy.connectGithubFirst);
        return;
      }
      const data = (await response.json()) as { repositories?: Repository[]; repos?: Repository[] };
      const list = data.repositories ?? data.repos ?? [];
      setRepositories(list);
      if (currentRepo && list.some((r) => r.fullName === currentRepo)) {
        void selectRepository(currentRepo, list);
      }
    } catch {
      setError(copy.connectGithubFirst);
    } finally {
      setLoadingRepos(false);
    }
  }

  useEffect(() => {
    if (initialStep === 'github') {
      void loadRepositories();
    }
  }, [initialStep]);

  async function selectRepository(value: string, repoList = repositories) {
    // Toggle off if clicking the same repo, or select the new single repo
    if (selectedRepo === value && branch) {
      return;
    }
    setSelectedRepo(value);
    const repoMeta = repoList.find((r) => r.fullName === value);
    const defaultBr = repoMeta?.defaultBranch || 'master';
    setBranch(defaultBr);
    setBranches([defaultBr]);

    const [owner, name] = value.split('/');
    if (!owner || !name) return;
    try {
      const response = await fetch(
        apiUrl(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`),
        {
          credentials: 'include',
          headers: { ...authHeaders() },
        },
      );
      if (response.ok) {
        const data = (await response.json()) as { branches: string[] };
        if (data.branches.length > 0) {
          setBranches(data.branches);
          if (repoMeta?.defaultBranch && data.branches.includes(repoMeta.defaultBranch)) {
            setBranch(repoMeta.defaultBranch);
          } else {
            setBranch(data.branches[0]!);
          }
        }
      }
    } catch {
      // Keep defaultBranch fallback
    }
  }

  const groupedRepositories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = repositories.filter((item) => {
      if (visibilityFilter !== 'all' && item.visibility !== visibilityFilter) return false;
      if (q && !item.fullName.toLowerCase().includes(q)) return false;
      return true;
    });

    const groups = new Map<string, Repository[]>();
    for (const item of filtered) {
      const [owner = 'repositories'] = item.fullName.split('/');
      const list = groups.get(owner) ?? [];
      list.push(item);
      groups.set(owner, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    return Array.from(groups.entries());
  }, [repositories, searchQuery, visibilityFilter]);

  const uniqueRecentRepos = useMemo(() => {
    return Array.from(new Set(recentRepos.map((r) => r.trim()).filter(Boolean)));
  }, [recentRepos]);

  if (step === 'visibility') {
    return (
      <section className="connector-panel connector-panel--wide">
        {onCancel && (
          <div className="connector-top-nav">
            <button type="button" className="connector-back" onClick={onCancel}>
              ← {copy.back}
            </button>
          </div>
        )}
        <span className="eyebrow">{copy.step1of2}</span>
        <h1>{copy.connectTitle}</h1>
        <p>{copy.connectDescription}</p>
        <div className="connector-options">
          <button type="button" onClick={() => void loadRepositories()}>
            <strong>{copy.useGithub}</strong>
            <small>{copy.useGithubDescription}</small>
          </button>
          <button type="button" onClick={() => setStep('public')}>
            <strong>{copy.publicRepository}</strong>
            <small>{copy.publicDescription}</small>
          </button>
        </div>

        {uniqueRecentRepos.length > 0 && (
          <div className="recent-repos-box">
            <div className="recent-repos-title">{copy.recentRepositories}</div>
            <div className="recent-repos-list">
              {uniqueRecentRepos.map((r) => {
                const isCurrent = r === currentRepo;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`recent-repo-chip ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => connectRepository(r, '')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                    <span>{r}</span>
                    {isCurrent ? <i className="recent-repo-check">✓</i> : <span className="recent-repo-arrow">↗</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (step === 'public') {
    return (
      <section className="connector-panel">
        <div className="connector-top-nav">
          <button type="button" className="connector-back" onClick={() => setStep('visibility')}>
            ← {copy.back}
          </button>
        </div>
        <span className="eyebrow">{copy.step2of2Public}</span>
        <h1>{copy.enterRepository}</h1>
        <p>{copy.noTokenNeeded}</p>
        <label className="field-label" htmlFor="public-repo">{copy.repository}</label>
        <input
          id="public-repo"
          className="input"
          placeholder={copy.repoPlaceholder}
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && repo.includes('/')) {
              connectRepository(repo, '');
            }
          }}
        />
        <button
          type="button"
          className="button button-primary"
          disabled={!repo.includes('/')}
          onClick={() => connectRepository(repo, '')}
        >
          {copy.connectRepository} ↗
        </button>

        {uniqueRecentRepos.length > 0 && (
          <div className="recent-repos-box">
            <div className="recent-repos-title">{copy.recentRepositories}</div>
            <div className="recent-repos-list">
              {uniqueRecentRepos.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`recent-repo-chip ${r === currentRepo ? 'is-current' : ''}`}
                  onClick={() => connectRepository(r, '')}
                >
                  <span>{r}</span>
                  <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="connector-panel connector-panel--picker">
      <div className="connector-top-nav">
        <button
          type="button"
          className="connector-back"
          onClick={() => (initialStep === 'github' && onCancel ? onCancel() : setStep('visibility'))}
        >
          ← {copy.back}
        </button>
      </div>
      <div className="snyk-picker-header">
        <div>
          <span className="eyebrow">{copy.githubPicker}</span>
          <h1>{copy.chooseRepo}</h1>
          <p>{copy.singleSelectHint}</p>
        </div>
        {uniqueRecentRepos.length > 0 && (
          <div className="recent-repos-inline">
            <span className="recent-repos-inline-label">{copy.recentRepositories}:</span>
            {uniqueRecentRepos.slice(0, 4).map((r) => (
              <button
                key={r}
                type="button"
                className={`recent-repo-pill ${selectedRepo === r ? 'is-active' : ''}`}
                onClick={() => connectRepository(r, '')}
                title={r}
              >
                {r.split('/')[1] || r} {r === currentRepo ? '✓' : '↗'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="snyk-picker-empty">
          <p>{error}</p>
          <a
            className="button button-primary"
            href={apiUrl('/api/auth/github')}
            onClick={(event) => {
              event.preventDefault();
              void startOAuth('github');
            }}
          >
            {copy.continueGithub} ↗
          </a>
        </div>
      ) : loadingRepos ? (
        <div className="snyk-picker-empty">
          <p>{copy.loadingRepos}</p>
        </div>
      ) : (
        <>
          <div className="snyk-picker-toolbar">
            <input
              type="search"
              className="input snyk-picker-search"
              placeholder={copy.searchReposPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="snyk-picker-filters">
              {(['all', 'public', 'private'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`snyk-filter-btn ${visibilityFilter === mode ? 'is-active' : ''}`}
                  onClick={() => setVisibilityFilter(mode)}
                >
                  {mode === 'all' ? copy.filterAll : mode === 'public' ? 'Public' : 'Private 🔒'}
                </button>
              ))}
            </div>
          </div>

          <div className="snyk-repo-card">
            {groupedRepositories.length === 0 ? (
              <div className="snyk-picker-empty">
                <p>{copy.noReposFound}</p>
              </div>
            ) : (
              groupedRepositories.map(([owner, items]) => {
                const isCollapsed = Boolean(collapsedOwners[owner]);
                const ownerHasSelected = items.some((r) => r.fullName === selectedRepo);
                return (
                  <div className="snyk-owner-group" key={owner}>
                    <button
                      type="button"
                      className="snyk-owner-header"
                      onClick={() =>
                        setCollapsedOwners((prev) => ({
                          ...prev,
                          [owner]: !prev[owner],
                        }))
                      }
                      aria-expanded={!isCollapsed}
                    >
                      <span className={`snyk-owner-box ${ownerHasSelected ? 'has-selected' : ''}`}>
                        {ownerHasSelected ? '•' : ''}
                      </span>
                      <span className="snyk-owner-chevron">{isCollapsed ? '▸' : '▾'}</span>
                      <strong className="snyk-owner-name">{owner}</strong>
                      <span className="snyk-owner-count">{items.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="snyk-repo-grid" role="radiogroup" aria-label={owner}>
                        {items.map((item) => {
                          const shortName = item.fullName.split('/')[1] || item.fullName;
                          const isSelected = selectedRepo === item.fullName;
                          const isPreviouslyUsed =
                            item.fullName === currentRepo || uniqueRecentRepos.includes(item.fullName);
                          return (
                            <button
                              key={item.fullName}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              className={`snyk-repo-item ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => void selectRepository(item.fullName)}
                            >
                              <span className={`snyk-repo-checkbox ${isSelected ? 'is-checked' : ''}`}>
                                {isSelected ? '✓' : ''}
                              </span>
                              <span className="snyk-repo-name" title={item.fullName}>
                                {shortName}
                              </span>
                              {item.visibility === 'private' && (
                                <svg
                                  className="snyk-repo-lock"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  aria-label="Private"
                                >
                                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2ZM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6Z" />
                                </svg>
                              )}
                              {isPreviouslyUsed && (
                                <span className="snyk-repo-connected-mark" title={copy.connected}>
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="snyk-picker-footer">
            <div className="snyk-picker-footer-note">{copy.contributorAccessNote}</div>
            <div className="snyk-picker-actions">
              {selectedRepo && (
                <div className="snyk-branch-select-wrap">
                  <span className="snyk-branch-label">Branch:</span>
                  <CustomDropdown
                    id="github-branch"
                    className="snyk-branch-dropdown"
                    value={branch}
                    options={branches.map((item) => ({ value: item, label: item }))}
                    onChange={(val) => setBranch(val)}
                    ariaLabel="Branch"
                    direction="up"
                  />
                </div>
              )}
              <button
                type="button"
                className="button button-primary"
                disabled={!selectedRepo}
                onClick={() => connectRepository(selectedRepo, '')}
              >
                {selectedRepo ? `${selectedRepo} · ${copy.connectRepository} ↗` : `${copy.connectRepository} ↗`}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
