import type { Locale, Translations } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import { apiUrl } from '../http';

export function Navbar({
  repo,
  token,
  locale,
  labels,
  status,
  isConnected,
  isConnecting,
  onRepoChange,
  onTokenChange,
  onLocaleChange,
  onConnect,
  onDisconnect,
}: {
  repo: string;
  token: string;
  locale: Locale;
  labels: Translations;
  status: string;
  isConnected: boolean;
  isConnecting: boolean;
  onRepoChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onLocaleChange: (value: Locale) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">FC</span>
        <div>
          <strong>{labels.brandTitle}</strong>
          <small>{labels.brandTagline}</small>
        </div>
      </div>
      <div className="side-label">{labels.workspace}</div>
      <p className="workspace-help">{labels.connectDescription}</p>
      <label className="field-label" htmlFor="repo">{labels.repository}</label>
      <input
        id="repo"
        className="input"
        placeholder={labels.repoPlaceholder}
        value={repo}
        onChange={(event) => onRepoChange(event.target.value)}
      />
      <small className="field-help">{labels.repositoryHint}</small>
      <label className="field-label" htmlFor="token">{labels.projectToken}</label>
      <input
        id="token"
        className="input"
        type="password"
        placeholder={labels.tokenPlaceholder}
        value={token}
        onChange={(event) => onTokenChange(event.target.value)}
      />
      <small className="field-help">{labels.tokenHint}</small>
      <div className="sidebar-actions">
        {isConnected ? (
          <div className="connected-group">
            <button className="button button-connected full" type="button" disabled>
              <span>✓ {labels.connected}</span>
            </button>
            <button className="button button-disconnect full" type="button" onClick={onDisconnect}>
              <span>{labels.disconnect}</span>
              <span>✕</span>
            </button>
          </div>
        ) : (
          <button
            className="button button-primary full"
            type="button"
            disabled={isConnecting || !repo.trim()}
            onClick={onConnect}
          >
            <span>{isConnecting ? labels.connecting : labels.connect}</span>
            <span>{isConnecting ? '…' : '↗'}</span>
          </button>
        )}
        <a className="button button-github full" href={apiUrl('/api/auth/github')}>
          <svg className="github-logo" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1.01.07 1.54 1.04 1.54 1.04.9 1.54 2.35 1.1 2.92.84.09-.65.35-1.1.63-1.35-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 7.99c.85 0 1.7.11 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.33 4.69-4.56 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>
          </svg>
          <span>{labels.connectGithub}</span>
          <span>↗</span>
        </a>
      </div>
      <LanguageSelector locale={locale} label={labels.language} onChange={onLocaleChange} />
      <div className="side-footer">
        <span className="status-dot" /> {labels.gatewayOnline}
        <small>{status}</small>
      </div>
    </aside>
  );
}
