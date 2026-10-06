import type { Flake } from '../types';

export function FlakeList({ flakes, selected, query, onQueryChange, onSelect, onExport }: { flakes: Flake[]; selected: Flake | null; query: string; onQueryChange: (value: string) => void; onSelect: (flake: Flake) => void; onExport: () => void }) {
  return <div className="queue-panel">
    <div className="section-head"><div><h2>Flake queue</h2><p>Deterministic findings requiring attention</p></div><button className="button button-ghost" onClick={onExport}>Export CSV ↓</button></div>
    <div className="filters"><input className="search" placeholder="Search tests, files, categories…" value={query} onChange={(event) => onQueryChange(event.target.value)} /><select><option>All branches</option><option>main</option><option>release</option></select><select><option>All statuses</option><option>FAILED</option><option>QUARANTINED</option></select></div>
    <div className="table">{flakes.map((flake) => <button className={`flake-row ${selected?.testId === flake.testId ? 'selected' : ''}`} key={flake.testId} onClick={() => onSelect(flake)}><span className={`severity ${flake.category.toLowerCase().replaceAll('_', '-')}`} /> <span className="test-cell"><strong>{flake.testName}</strong><small>{flake.filePath}</small></span><span className="category">{flake.category.replaceAll('_', ' ')}</span><span className="confidence">{flake.confidence}%</span><span className="arrow">→</span></button>)}</div>
  </div>;
}
