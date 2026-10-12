import type { ReactNode } from 'react';
import type { Locale, Translations } from '../i18n';
import { CustomDropdown } from './CustomDropdown';
import { LanguageSelector } from './LanguageSelector';

export type DashboardSection = 'overview' | 'history' | 'flakes' | 'cost' | 'settings';

export function Navbar({
  repo,
  token,
  locale,
  labels,
  status,
  isConnected,
  isConnecting,
  isOpen = true,
  activeSection = 'overview',
  runsCount = 0,
  flakesCount = 0,
  recentRepos = [],
  onSectionChange,
  onRepoChange,
  onTokenChange,
  onLocaleChange,
  onConnect,
  onDisconnect,
  onSwitchRepo,
  onOpenPicker,
  onClose,
  onToggle,
}: {
  repo: string;
  token: string;
  locale: Locale;
  labels: Translations;
  status: string;
  isConnected: boolean;
  isConnecting: boolean;
  isOpen?: boolean;
  activeSection?: DashboardSection;
  runsCount?: number;
  flakesCount?: number;
  recentRepos?: string[];
  onSectionChange?: (section: DashboardSection) => void;
  onRepoChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onLocaleChange: (value: Locale) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchRepo?: (repo: string) => void;
  onOpenPicker?: () => void;
  onClose?: () => void;
  onToggle?: () => void;
}) {
  const navItems: Array<{
    id: DashboardSection;
    label: string;
    badge?: number | string;
    icon: ReactNode;
  }> = [
    {
      id: 'overview',
      label: labels.tabOverview,
      icon: (
        <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: labels.tabHistory,
      badge: runsCount,
      icon: (
        <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
      ),
    },
    {
      id: 'flakes',
      label: labels.tabFlakes,
      badge: flakesCount,
      icon: (
        <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      ),
    },
    {
      id: 'cost',
      label: labels.tabCostArtifacts,
      icon: (
        <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: labels.tabSettings,
      icon: (
        <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      ),
    },
  ];

  const handleToggle = onToggle ?? onClose;

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${isOpen ? 'is-open' : 'is-collapsed'}`}>
        <div className="sidebar-brand-row">
          <a className="brand" href="/">
            <span className="brand-mark">FC</span>
            <div className="brand-text">
              <strong>{labels.brandTitle}</strong>
              <small>{labels.brandTagline}</small>
            </div>
          </a>
          {handleToggle && (
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={handleToggle}
              aria-label="Toggle navigation menu"
              aria-expanded={isOpen}
              title={labels.workspace}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Primary Section Navigation (Snyk Sidebar Style) */}
        <div className="sidebar-nav-section">
          <div className="side-label sidebar-section-title" style={{ marginBottom: '8px', paddingLeft: '4px' }}>
            {labels.projectsBreadcrumb}
          </div>
          <nav className="sidebar-nav" aria-label={labels.workspace}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                className={`sidebar-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => onSectionChange?.(item.id)}
              >
                <span className="sidebar-nav-item-left">
                  {item.icon}
                  <span className="sidebar-nav-label">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="sidebar-nav-badge">{item.badge}</span>
                )}
              </button>
            ))}
            <a
              href="/docs"
              title={labels.docsNav}
              aria-label={labels.docsNav}
              className="sidebar-nav-item"
              style={{ textDecoration: 'none' }}
            >
              <span className="sidebar-nav-item-left">
                <svg className="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span className="sidebar-nav-label">{labels.docsNav}</span>
              </span>
              <span className="sidebar-nav-badge">↗</span>
            </a>
          </nav>
        </div>

        {/* Compact Workspace Connection Box */}
        <div className="sidebar-box">
          <div className="side-label">{labels.workspace}</div>
          <label className="field-label" htmlFor="repo">{labels.repository}</label>
          <input
            id="repo"
            className="input"
            placeholder={labels.repoPlaceholder}
            value={repo}
            onChange={(event) => onRepoChange(event.target.value)}
          />
          {recentRepos.length > 1 && onSwitchRepo && (
            <CustomDropdown
              compact
              value={recentRepos.includes(repo) ? repo : ''}
              placeholder={`${labels.recentRepositories}…`}
              ariaLabel={labels.recentRepositories}
              options={recentRepos.map((item) => ({
                value: item,
                label: item,
              }))}
              onChange={(targetRepo) => onSwitchRepo(targetRepo)}
            />
          )}
          <div className="sidebar-actions">
            {isConnected ? (
              <div className="connected-group">
                <button className="button button-connected full" type="button" disabled>
                  <span>✓ {labels.connected}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{repo.split('/')[1] || repo}</span>
                </button>
                {onOpenPicker && (
                  <button className="button button-ghost full" type="button" onClick={onOpenPicker}>
                    <span>{labels.chooseAnotherRepo}</span>
                    <span>＋</span>
                  </button>
                )}
                <button className="button button-disconnect full" type="button" onClick={onDisconnect}>
                  <span>{labels.disconnect}</span>
                  <span>✕</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  className="button button-primary full"
                  type="button"
                  disabled={isConnecting || !repo.trim()}
                  onClick={onConnect}
                >
                  <span>{isConnecting ? labels.connecting : labels.connect}</span>
                  <span>{isConnecting ? '…' : '↗'}</span>
                </button>
                {onOpenPicker && (
                  <button className="button button-ghost full" type="button" onClick={onOpenPicker}>
                    <span>{labels.chooseAnotherRepo}</span>
                    <span>＋</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="sidebar-lang-wrap" style={{ padding: '0 4px' }}>
          <LanguageSelector locale={locale} label={labels.language} onChange={onLocaleChange} />
        </div>

        <div className="side-footer" title={labels.gatewayOnline}>
          <span className="status-dot" />
          <span className="side-footer-text">{labels.gatewayOnline}</span>
          <small className="side-footer-sub">{status}</small>
        </div>
      </aside>
    </>
  );
}
