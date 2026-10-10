import type { Flake } from '../types';
import type { Translations } from '../i18n';

export function FlakeList({
  flakes,
  selected,
  query,
  labels,
  onQueryChange,
  onSelect,
  onExport,
}: {
  flakes: Flake[];
  selected: Flake | null;
  query: string;
  labels: Translations;
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
          <option>main</option>
          <option>release</option>
        </select>
        <select>
          <option>{labels.allStatuses}</option>
          <option>{labels.statusFailed}</option>
          <option>{labels.statusQuarantined}</option>
        </select>
      </div>
      <div className="table">
        {flakes.length === 0 ? (
          <div className="empty">{labels.noActiveFlakes}</div>
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
