import type { Flake } from '../types';
import type { Translations } from '../i18n';

export function FlakeList({
  flakes,
  selected,
  query,
  labels,
  activeBranch,
  onQueryChange,
  onSelect,
  onExport,
}: {
  flakes: Flake[];
  selected: Flake | null;
  query: string;
  labels: Translations;
  activeBranch?: string;
  onQueryChange: (value: string) => void;
  onSelect: (flake: Flake) => void;
  onExport: () => void;
}) {
  return (
    <div className="queue-panel">
      <div className="section-head">
        <div>
          <h2>{labels.flakes}</h2>
          <p>{labels.queueSubtitle}</p>
        </div>
        <button type="button" className="button button-ghost" onClick={onExport}>
          {labels.exportCsv} ↓
        </button>
      </div>
      <div className="filters">
        <input
          className="search"
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <select>
          <option>{labels.allBranches}</option>
          {activeBranch && <option value={activeBranch}>{activeBranch}</option>}
        </select>
        <select>
          <option>{labels.allStatuses}</option>
          <option>{labels.statusFailed}</option>
          <option>{labels.statusQuarantined}</option>
        </select>
      </div>
      <div className="table">
        {flakes.length === 0 ? (
          <div className="empty" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem', color: '#4ade80' }}>✔</div>
            <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text-color, #f1f5f9)', marginBottom: '0.4rem' }}>
              {labels.allTestsDeterministic}
            </strong>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #8892b0)', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
              {labels.allTestsDeterministicDesc}
            </p>
          </div>
        ) : (
          flakes.map((flake) => (
            <button
              type="button"
              className={`flake-row ${selected?.testId === flake.testId ? 'selected' : ''}`}
              key={flake.testId}
              onClick={() => onSelect(flake)}
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
          ))
        )}
      </div>
    </div>
  );
}
