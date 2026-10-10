import type { RunDetails } from '../types';
import type { Translations, Locale } from '../i18n';

export function RunDetailsModal({
  runId,
  details,
  loading,
  error,
  labels,
  locale,
  onClose,
}: {
  runId: string;
  details: RunDetails | null;
  loading: boolean;
  error: string | null;
  labels: Translations;
  locale: Locale;
  onClose: () => void;
}) {
  const failedAttempts = details?.attempts.filter((a) => a.status === 'FAILED') ?? [];
  const passedAttempts = details?.attempts.filter((a) => a.status === 'PASSED') ?? [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal account-modal"
        style={{ maxWidth: '820px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close account-modal-close"
          onClick={onClose}
          aria-label={labels.close}
        >
          ×
        </button>

        <span className="eyebrow">{labels.runDetailsTitle}</span>
        <h2 style={{ wordBreak: 'break-all', fontSize: '1.4rem', margin: '0.4rem 0' }}>
          {runId}
        </h2>
        <p style={{ color: 'var(--text-muted, #8892b0)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
          {labels.runDetailsSubtitle}
        </p>

        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #8892b0)' }}>
            {labels.loadingRunDetails}
          </div>
        )}

        {error && (
          <div style={{ padding: '1rem', background: '#3b1818', color: '#ffaaaa', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {details && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.8rem',
                background: '#0d1117',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #232936)',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.commit}</small>
                <code style={{ color: '#38bdf8' }}>{details.run.commitSha ? details.run.commitSha.slice(0, 7) : '—'}</code>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.branch}</small>
                <strong>{details.run.branch || 'main'}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.totalAttempts}</small>
                <strong>{details.attempts.length}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.failedAttemptsCount}</small>
                <strong style={{ color: failedAttempts.length > 0 ? '#f87171' : '#4ade80' }}>
                  {failedAttempts.length}
                </strong>
              </div>
            </div>

            {failedAttempts.length > 0 && (
              <div style={{ marginBottom: '1.8rem' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f87171', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>✖</span> {labels.failedAttemptsCount} ({failedAttempts.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {failedAttempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      style={{
                        background: '#1a1012',
                        border: '1px solid #4a1d24',
                        borderRadius: '6px',
                        padding: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                        <div>
                          <strong style={{ color: '#ffaaaa', fontSize: '1rem' }}>{attempt.testName}</strong>
                          <div style={{ color: 'var(--text-muted, #8892b0)', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                            {attempt.filePath}
                          </div>
                        </div>
                        <span style={{ background: '#7f1d1d', color: '#fecaca', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {labels.failed.toUpperCase()}
                        </span>
                      </div>

                      {attempt.failureSignature && (
                        <div style={{ marginTop: '0.6rem' }}>
                          <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block', marginBottom: '0.2rem' }}>
                            {labels.errorMessage}:
                          </small>
                          <pre
                            style={{
                              background: '#0a0d14',
                              color: '#ff8080',
                              padding: '0.6rem',
                              borderRadius: '4px',
                              fontSize: '0.82rem',
                              overflowX: 'auto',
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {attempt.failureSignature}
                          </pre>
                        </div>
                      )}

                      {attempt.rawError && attempt.rawError !== attempt.failureSignature && (
                        <div style={{ marginTop: '0.6rem' }}>
                          <pre
                            style={{
                              background: '#0a0d14',
                              color: '#ffb3b3',
                              padding: '0.6rem',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              overflowX: 'auto',
                              margin: 0,
                              maxHeight: '160px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {attempt.rawError}
                          </pre>
                        </div>
                      )}

                      {attempt.classification && (
                        <div style={{ marginTop: '0.6rem', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--text-muted, #8892b0)' }}>Classification: </span>
                          <strong style={{ color: '#38bdf8' }}>{attempt.classification.category}</strong>
                          <span style={{ color: 'var(--text-muted, #8892b0)' }}> ({attempt.classification.confidence}% confidence)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {passedAttempts.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', color: '#4ade80', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>✔</span> {labels.passed} ({passedAttempts.length})
                </h3>
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color, #232936)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <tbody>
                      {passedAttempts.map((attempt) => (
                        <tr key={attempt.id} style={{ borderBottom: '1px solid #1a202c' }}>
                          <td style={{ padding: '0.5rem 0.8rem', color: '#4ade80' }}>✔</td>
                          <td style={{ padding: '0.5rem 0.8rem' }}>{attempt.testName}</td>
                          <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted, #8892b0)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {attempt.filePath}
                          </td>
                          <td style={{ padding: '0.5rem 0.8rem', textAlign: 'right', color: 'var(--text-muted, #8892b0)' }}>
                            {attempt.durationMs}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {failedAttempts.length === 0 && passedAttempts.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted, #8892b0)', padding: '1rem' }}>
                {labels.noFailuresInRun}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
