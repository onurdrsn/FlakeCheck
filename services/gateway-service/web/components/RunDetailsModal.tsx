import { useMemo, useState } from 'react';
import type { RunDetails } from '../types';
import type { Translations, Locale } from '../i18n';

export function RunDetailsModal({
  runId,
  details,
  loading,
  error,
  labels,
  defaultBranch,
  defaultCommitSha,
  onClose,
}: {
  runId: string;
  details: RunDetails | null;
  loading: boolean;
  error: string | null;
  labels: Translations;
  locale: Locale;
  defaultBranch?: string;
  defaultCommitSha?: string;
  onClose: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<string>('ALL');
  const [passedPage, setPassedPage] = useState(1);
  const pageSize = 15;

  const fileGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const attempt of details?.attempts ?? []) {
      const file = attempt.filePath || '<unknown>';
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [details]);

  const filteredAttempts = useMemo(() => {
    const all = details?.attempts ?? [];
    if (selectedFile === 'ALL') return all;
    return all.filter((a) => (a.filePath || '<unknown>') === selectedFile);
  }, [details, selectedFile]);

  const failedAttempts = filteredAttempts.filter((a) => a.status === 'FAILED');
  const passedAttempts = filteredAttempts.filter((a) => a.status === 'PASSED');
  const totalPassedPages = Math.max(1, Math.ceil(passedAttempts.length / pageSize));
  const currentPassedPage = Math.min(passedPage, totalPassedPages);
  const startIdx = (currentPassedPage - 1) * pageSize;
  const visiblePassed = passedAttempts.slice(startIdx, startIdx + pageSize);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal account-modal"
        style={{ maxWidth: '880px', width: '92%', maxHeight: '88vh', overflowY: 'auto' }}
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
        <h2 style={{ wordBreak: 'break-all', fontSize: '1.35rem', margin: '0.4rem 0' }}>
          {runId === 'all' ? labels.combinedRunsTitle : runId}
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.8rem',
                background: '#0d1117',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #232936)',
                marginBottom: '1.2rem',
              }}
            >
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.commit}</small>
                <code style={{ color: '#38bdf8' }}>
                  {(() => {
                    const raw = details.run.commitSha;
                    const valid = raw && !/^[0-9a-f]{64}$/i.test(raw) && raw !== 'local' && raw !== 'local-report' ? raw : defaultCommitSha;
                    return valid ? valid.slice(0, 7) : '—';
                  })()}
                </code>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.branch}</small>
                <strong>
                  {details.run.branch && details.run.branch !== 'local' && details.run.branch !== 'local-report'
                    ? details.run.branch
                    : (defaultBranch || '—')}
                </strong>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.testFiles}</small>
                <strong>{fileGroups.length}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.totalAttempts}</small>
                <strong>{filteredAttempts.length}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block' }}>{labels.failedAttemptsCount}</small>
                <strong style={{ color: failedAttempts.length > 0 ? '#f87171' : '#4ade80' }}>
                  {failedAttempts.length}
                </strong>
              </div>
            </div>

            {fileGroups.length > 1 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <small style={{ color: 'var(--text-muted, #8892b0)', display: 'block', marginBottom: '0.45rem' }}>
                  {labels.testFiles} ({fileGroups.length}):
                </small>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className={selectedFile === 'ALL' ? 'button button-primary' : 'button button-ghost'}
                    onClick={() => {
                      setSelectedFile('ALL');
                      setPassedPage(1);
                    }}
                    style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem' }}
                  >
                    {labels.allFiles} ({details.attempts.length})
                  </button>
                  {fileGroups.map(([file, count]) => {
                    const shortName = file.split('/').slice(-2).join('/');
                    return (
                      <button
                        key={file}
                        type="button"
                        title={file}
                        className={selectedFile === file ? 'button button-primary' : 'button button-ghost'}
                        onClick={() => {
                          setSelectedFile(file);
                          setPassedPage(1);
                        }}
                        style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem', fontFamily: 'monospace' }}
                      >
                        {shortName} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                <div style={{ border: '1px solid var(--border-color, #232936)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <tbody>
                      {visiblePassed.map((attempt) => (
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
                {totalPassedPages > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '0.75rem',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted, #8892b0)',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <span>
                      {labels.pageLabel} {currentPassedPage} / {totalPassedPages} ({startIdx + 1}–{Math.min(startIdx + pageSize, passedAttempts.length)} / {passedAttempts.length})
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={currentPassedPage <= 1}
                        onClick={() => setPassedPage((p) => Math.max(1, p - 1))}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', opacity: currentPassedPage <= 1 ? 0.45 : 1 }}
                      >
                        {labels.prevPage}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        disabled={currentPassedPage >= totalPassedPages}
                        onClick={() => setPassedPage((p) => Math.min(totalPassedPages, p + 1))}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', opacity: currentPassedPage >= totalPassedPages ? 0.45 : 1 }}
                      >
                        {labels.nextPage}
                      </button>
                    </div>
                  </div>
                )}
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
