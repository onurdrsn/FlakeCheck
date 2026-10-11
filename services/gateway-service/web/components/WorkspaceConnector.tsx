import { useState } from 'react';
import { apiUrl, authHeaders, startOAuth } from '../http';
import type { Locale } from '../i18n';
import { translations } from '../i18n';

type Repository = { fullName: string; visibility: 'public' | 'private'; defaultBranch: string };

export function WorkspaceConnector({ onConnect, locale = 'en' }: { onConnect: (repo: string, token: string) => void; locale?: Locale }) {
  const copy = translations[locale];
  const [step, setStep] = useState<'visibility' | 'public' | 'github'>('visibility');
  const [repo, setRepo] = useState('');
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [error, setError] = useState('');

  const connectRepository = (repository: string, projectToken: string) => {
    if (!repository.trim()) return;
    onConnect(repository.trim(), projectToken);
  };

  async function loadRepositories() {
    setError('');
    setStep('github');
    const response = await fetch(apiUrl('/api/github/repos'), {
      credentials: 'include',
      headers: { ...authHeaders() },
    });
    if (!response.ok) {
      setError(copy.connectGithubFirst);
      return;
    }
    const data = (await response.json()) as { repositories?: Repository[]; repos?: Repository[] };
    setRepositories(data.repositories ?? data.repos ?? []);
  }

  async function selectRepository(value: string) {
    setSelectedRepo(value);
    setBranch('');
    const [owner, name] = value.split('/');
    if (!owner || !name) return;
    const response = await fetch(
      apiUrl(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`),
      {
        credentials: 'include',
        headers: { ...authHeaders() },
      },
    );
    if (response.ok) {
      const data = (await response.json()) as { branches: string[] };
      setBranches(data.branches);
      const repoMeta = repositories.find((r) => r.fullName === value);
      if (repoMeta?.defaultBranch && data.branches.includes(repoMeta.defaultBranch)) {
        setBranch(repoMeta.defaultBranch);
      } else if (data.branches[0]) {
        setBranch(data.branches[0]);
      }
    }
  }

  if (step === 'visibility') {
    return (
      <section className="connector-panel">
        <span className="eyebrow">{copy.step1of2}</span>
        <h1>{copy.connectTitle}</h1>
        <p>{copy.connectDescription}</p>
        <div className="connector-options">
          <button type="button" onClick={() => setStep('public')}>
            <strong>{copy.publicRepository}</strong>
            <small>{copy.publicDescription}</small>
          </button>
          <button type="button" onClick={() => void loadRepositories()}>
            <strong>{copy.useGithub}</strong>
            <small>{copy.useGithubDescription}</small>
          </button>
        </div>
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
        />
        <button
          type="button"
          className="button button-primary"
          disabled={!repo.includes('/')}
          onClick={() => connectRepository(repo, '')}
        >
          {copy.connectRepository} ↗
        </button>
      </section>
    );
  }

  return (
    <section className="connector-panel">
      <div className="connector-top-nav">
        <button type="button" className="connector-back" onClick={() => setStep('visibility')}>
          ← {copy.back}
        </button>
      </div>
      <span className="eyebrow">{copy.githubPicker}</span>
      <h1>{copy.chooseRepo}</h1>
      {error ? (
        <>
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
        </>
      ) : (
        <>
          <label className="field-label" htmlFor="github-repo">{copy.repository}</label>
          <select id="github-repo" className="input" value={selectedRepo} onChange={(event) => void selectRepository(event.target.value)}>
            <option value="">{copy.selectRepo}</option>
            {repositories.map((item) => (
              <option key={item.fullName} value={item.fullName}>{item.fullName} · {item.visibility}</option>
            ))}
          </select>
          <label className="field-label" htmlFor="github-branch">{copy.selectBranch}</label>
          <select id="github-branch" className="input" value={branch} onChange={(event) => setBranch(event.target.value)} disabled={!selectedRepo}>
            <option value="">{copy.selectBranch}</option>
            {branches.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button
            type="button"
            className="button button-primary"
            disabled={!selectedRepo || !branch}
            onClick={() => connectRepository(selectedRepo, '')}
          >
            {copy.connectBranch} ↗
          </button>
        </>
      )}
    </section>
  );
}
