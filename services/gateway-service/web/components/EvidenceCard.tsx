import type { ApiClient, Flake, TimelineItem } from '../types';
import type { Translations } from '../i18n';
import { userFacingMessage } from '../http';

export function EvidenceCard({
  selected,
  timeline,
  labels,
  setStatus,
  onTimelineLoad,
  onQuarantine,
}: {
  selected: Flake | null;
  api: ApiClient;
  timeline: TimelineItem[];
  labels: Translations;
  setStatus: (value: string) => void;
  onTimelineLoad: () => Promise<void>;
  onQuarantine: () => void;
}) {
  if (!selected) {
    return (
      <aside className="evidence-panel">
        <div className="empty">{labels.selectFinding}</div>
      </aside>
    );
  }

  return (
    <aside className="evidence-panel">
      <div className="evidence-head">
        <div>
          <span className="eyebrow">{labels.selectedFinding}</span>
          <h2>{selected.testName}</h2>
          <p>{selected.filePath}</p>
        </div>
        <span className="confidence-ring">
          {selected.confidence}
          <small>%</small>
        </span>
      </div>
      <div className="classification">
        <span className="signal" />
        {selected.category.replaceAll('_', ' ')}
        <small>{labels.deterministicClassification}</small>
      </div>
      <div className="evidence-block">
        <div className="block-head">
          <span>{labels.evidencePayload}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(selected.evidence, null, 2)).then(() => {
                setStatus(labels.copied);
              });
            }}
          >
            {labels.copy}
          </button>
        </div>
        <pre>{JSON.stringify(selected.evidence, null, 2)}</pre>
      </div>
      <div className="evidence-block timeline">
        <div className="block-head">
          <span>{labels.recentTimeline}</span>
          <button
            type="button"
            onClick={() =>
              onTimelineLoad()
                .then(() => setStatus(labels.timelineLoaded))
                .catch((error) => setStatus(userFacingMessage(error, labels.timelineError)))
            }
          >
            {labels.refresh}
          </button>
        </div>
        {timeline.length ? (
          timeline.map((item) => (
            <div className="timeline-item" key={`${item.run.id}-${item.attempt.status}`}>
              <i className={item.attempt.status === 'PASSED' ? 'pass' : 'fail'} />
              <span>
                <b>{item.run.id}</b>
                <small>{labels.commit} {item.run.commitSha}</small>
              </span>
              <strong>{item.attempt.status}</strong>
            </div>
          ))
        ) : (
          <p className="empty">{labels.timelineEmpty}</p>
        )}
      </div>
      <button type="button" className="button button-primary full quarantine" onClick={onQuarantine}>
        {labels.manageQuarantine} <span>→</span>
      </button>
    </aside>
  );
}
