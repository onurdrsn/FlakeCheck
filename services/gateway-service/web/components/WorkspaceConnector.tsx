import { useState } from 'react';

import type { Locale } from '../i18n';
import { translations } from '../i18n';
type Repository = { fullName: string; visibility: 'public' | 'private'; defaultBranch: string };

export function WorkspaceConnector({ onConnect, locale = 'en' }: { onConnect: (repo: string, token: string) => void; locale?: Locale }) {
  const copy = translations[locale];
  const [step, setStep] = useState<'visibility' | 'public' | 'private' | 'github'>('visibility');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [help, setHelp] = useState(false);
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
    setStep('github');
    const response = await fetch('/api/github/repos', { credentials: 'include' });
    if (!response.ok) {
      setError('Connect GitHub first, then return here to choose a repository.');
      return;
    }
    const data = await response.json() as { repositories: Repository[] };
    setRepositories(data.repositories);
  }

  async function selectRepository(value: string) {
    setSelectedRepo(value);
    setBranch('');
    const [owner, name] = value.split('/');
    if (!owner || !name) return;
    const response = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`, { credentials: 'include' });
    if (response.ok) setBranches((await response.json() as { branches: string[] }).branches);
  }

  if (step === 'visibility') return <section className="connector-panel"><span className="eyebrow">Step 1 of 2</span><h1>{copy.connectTitle}</h1><p>{copy.connectDescription}</p><div className="connector-options"><button onClick={() => setStep('public')}><strong>{copy.publicRepository}</strong><small>{copy.publicDescription}</small></button><button onClick={() => setStep('private')}><strong>{copy.privateRepository}</strong><small>{copy.privateDescription}</small></button><button onClick={() => void loadRepositories()}><strong>{copy.useGithub}</strong><small>{copy.useGithubDescription}</small></button></div></section>;
  if (step === 'public') return <section className="connector-panel"><button className="connector-back" onClick={() => setStep('visibility')}>← {copy.back}</button><span className="eyebrow">Step 2 of 2 · Public</span><h1>{copy.enterRepository}</h1><p>{copy.noTokenNeeded}</p><label className="field-label" htmlFor="public-repo">{copy.repository}</label><input id="public-repo" className="input" placeholder="owner/name · e.g. acme/payments" value={repo} onChange={(event) => setRepo(event.target.value)} /><button className="button button-primary" disabled={!repo.includes('/')} onClick={() => connectRepository(repo, '')}>{copy.connectRepository} ↗</button></section>;
  if (step === 'private') return <section className="connector-panel"><button className="connector-back" onClick={() => setStep('visibility')}>← {copy.back}</button><span className="eyebrow">Step 2 of 2 · Private</span><h1>{copy.privateTitle}</h1><p>{copy.tokenRequired}</p><label className="field-label" htmlFor="private-repo">{copy.repository}</label><input id="private-repo" className="input" placeholder="owner/name · e.g. acme/payments" value={repo} onChange={(event) => setRepo(event.target.value)} /><label className="field-label" htmlFor="private-token">{copy.projectToken} <button className="help-button" onClick={() => setHelp(true)} aria-label={copy.tokenHelp}>?</button></label><input id="private-token" className="input" type="password" placeholder={copy.projectToken} value={token} onChange={(event) => setToken(event.target.value)} /><button className="button button-primary" disabled={!repo.includes('/') || !token} onClick={() => connectRepository(repo, token)}>{copy.connectRepository} ↗</button>{help && <div className="modal-backdrop" onClick={() => setHelp(false)}><div className="modal token-help" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setHelp(false)}>×</button><span className="eyebrow">{copy.projectToken}</span><h2>{copy.tokenHelpTitle}</h2><p>{copy.tokenHelpBody}</p><button className="button button-primary" onClick={() => setHelp(false)}>OK</button></div></div>}</section>;
  return <section className="connector-panel"><button className="connector-back" onClick={() => setStep('visibility')}>← {copy.back}</button><span className="eyebrow">{copy.githubPicker}</span><h1>{copy.chooseRepo}</h1>{error ? <><p>{error}</p><a className="button button-primary" href="/api/auth/github">{copy.continueGithub} ↗</a></> : <><label className="field-label" htmlFor="github-repo">{copy.repository}</label><select id="github-repo" className="input" value={selectedRepo} onChange={(event) => void selectRepository(event.target.value)}><option value="">{copy.selectRepo}</option>{repositories.map((item) => <option key={item.fullName} value={item.fullName}>{item.fullName} · {item.visibility}</option>)}</select><label className="field-label" htmlFor="github-branch">{copy.selectBranch}</label><select id="github-branch" className="input" value={branch} onChange={(event) => setBranch(event.target.value)} disabled={!selectedRepo}><option value="">{copy.selectBranch}</option>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="button button-primary" disabled={!selectedRepo || !branch} onClick={() => connectRepository(selectedRepo, '')}>{copy.connectBranch} ↗</button></>}</section>;
}
