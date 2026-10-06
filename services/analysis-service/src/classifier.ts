import type { AnalysisSnapshot, AttemptSnapshot, Classification, ClassificationCategory, RunSnapshot } from './model.js';

export const CLASSIFICATION_PRECEDENCE: readonly ClassificationCategory[] = [
  'PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'INFRASTRUCTURE_FAILURE',
  'REGRESSION', 'STABLE_FAILURE', 'SUSPECTED_FLAKE', 'INSUFFICIENT_DATA',
];

function attemptsFor(snapshot: AnalysisSnapshot, testId: string): AttemptSnapshot[] {
  return snapshot.attempts.filter((attempt) => attempt.testId === testId);
}

function runsFor(snapshot: AnalysisSnapshot, testId: string): RunSnapshot[] {
  const ids = new Set(attemptsFor(snapshot, testId).map((attempt) => attempt.runId));
  return snapshot.runs.filter((run) => ids.has(run.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function failed(attempt: AttemptSnapshot): boolean {
  return attempt.status === 'FAILED';
}

function infrastructure(attempt: AttemptSnapshot): boolean {
  const text = `${attempt.failureSignature ?? ''} ${attempt.rawError ?? ''}`.toUpperCase();
  return /ECONNREFUSED|ETIMEDOUT|ECONNRESET|SIGKILL|EXIT\s*137|DISK\s*FULL|NO\s*SPACE/.test(text);
}

function categoryEvidence(category: ClassificationCategory, attempts: AttemptSnapshot[], runs: RunSnapshot[], extra: Record<string, unknown>): Record<string, unknown> {
  return { category, runIds: runs.map((run) => run.id), attemptIds: attempts.map((attempt) => attempt.id), ...extra };
}

export function classifyTest(snapshot: AnalysisSnapshot, testId: string, targetRunId: string): Classification {
  const attempts = attemptsFor(snapshot, testId);
  const historyRuns = runsFor(snapshot, testId);
  const byRun = new Map(historyRuns.map((run) => [run.id, attempts.filter((attempt) => attempt.runId === run.id)]));
  const sameCommitEnvironment = new Map<string, AttemptSnapshot[]>();
  for (const run of historyRuns) {
    const key = `${run.commitSha}:${run.envFingerprint}`;
    sameCommitEnvironment.set(key, [...(sameCommitEnvironment.get(key) ?? []), ...(byRun.get(run.id) ?? [])]);
  }
  const provenGroup = [...sameCommitEnvironment.entries()].find(([, group]) => group.some(failed) && group.some((attempt) => attempt.status === 'PASSED'));
  if (provenGroup) {
    return { testId, runId: targetRunId, category: 'PROVEN_FLAKE', confidence: 100, evidence: categoryEvidence('PROVEN_FLAKE', provenGroup[1], historyRuns, { commitEnvironment: provenGroup[0] }) };
  }

  const byCommit = new Map<string, RunSnapshot[]>();
  for (const run of historyRuns) byCommit.set(run.commitSha, [...(byCommit.get(run.commitSha) ?? []), run]);
  const environmentSensitive = [...byCommit.entries()].find(([, commitRuns]) => {
    const byEnv = new Map<string, AttemptSnapshot[]>();
    for (const run of commitRuns) byEnv.set(run.envFingerprint, [...(byEnv.get(run.envFingerprint) ?? []), ...(byRun.get(run.id) ?? [])]);
    const groups = [...byEnv.values()];
    return groups.length >= 2 && groups.some((group) => group.length > 0 && group.every((attempt) => attempt.status === 'PASSED'))
      && groups.some((group) => group.length > 0 && group.every(failed));
  });
  if (environmentSensitive) {
    return { testId, runId: targetRunId, category: 'ENVIRONMENT_SENSITIVE', confidence: 90, evidence: categoryEvidence('ENVIRONMENT_SENSITIVE', attempts, historyRuns, { commitSha: environmentSensitive[0] }) };
  }

  const targetAttempts = attempts.filter((attempt) => attempt.runId === targetRunId);
  const infraAttempts = targetAttempts.filter(infrastructure);
  const targetRun = snapshot.runs.find((run) => run.id === targetRunId);
  const suiteAttempts = targetRun ? snapshot.attempts.filter((attempt) => attempt.runId === targetRun.id) : [];
  const infraRatio = suiteAttempts.length ? suiteAttempts.filter(infrastructure).length / suiteAttempts.length : 0;
  if (infraAttempts.length > 0 || infraRatio >= 0.3) {
    return { testId, runId: targetRunId, category: 'INFRASTRUCTURE_FAILURE', confidence: 95, evidence: categoryEvidence('INFRASTRUCTURE_FAILURE', infraAttempts.length ? infraAttempts : suiteAttempts, historyRuns, { infraRatio }) };
  }

  const latest = historyRuns[historyRuns.length - 1];
  const earlier = historyRuns.slice(0, -1);
  const earlierPassed = earlier.length >= 5 && earlier.slice(-5).every((run) => (byRun.get(run.id) ?? []).some((attempt) => attempt.status === 'PASSED'));
  const latestFailed = latest ? (byRun.get(latest.id) ?? []).some(failed) : false;
  const retriedFailed = latest ? (byRun.get(latest.id) ?? []).filter((attempt) => attempt.attemptNumber > 1).every(failed) : false;
  if (earlierPassed && latest?.codeDiff && latestFailed && retriedFailed) {
    return { testId, runId: targetRunId, category: 'REGRESSION', confidence: 85, evidence: categoryEvidence('REGRESSION', attempts, historyRuns, { priorPassedRuns: 5 }) };
  }

  const lastThree = historyRuns.slice(-3);
  if (lastThree.length >= 3 && new Set(lastThree.map((run) => run.commitSha)).size >= 2 && lastThree.every((run) => (byRun.get(run.id) ?? []).length > 0 && (byRun.get(run.id) ?? []).every(failed))) {
    return { testId, runId: targetRunId, category: 'STABLE_FAILURE', confidence: 90, evidence: categoryEvidence('STABLE_FAILURE', attempts, lastThree, { commits: lastThree.map((run) => run.commitSha) }) };
  }

  const transitions = historyRuns.slice(1).map((run, index) => {
    const before = byRun.get(historyRuns[index].id) ?? [];
    const current = byRun.get(run.id) ?? [];
    return { run, changed: Boolean(historyRuns[index].codeDiff), flip: before.some((attempt) => attempt.status !== current[0]?.status) };
  });
  const flipCount = transitions.filter((item) => item.flip && !item.changed).length;
  const flipRate = transitions.length ? flipCount / transitions.length : 0;
  if (flipRate >= 0.15) {
    return { testId, runId: targetRunId, category: 'SUSPECTED_FLAKE', confidence: Math.min(100, flipCount * 25), evidence: categoryEvidence('SUSPECTED_FLAKE', attempts, historyRuns, { flipCount, flipRate }) };
  }

  if (historyRuns.length < 3) {
    return { testId, runId: targetRunId, category: 'INSUFFICIENT_DATA', confidence: 0, evidence: categoryEvidence('INSUFFICIENT_DATA', attempts, historyRuns, { historicalRuns: historyRuns.length }) };
  }
  return { testId, runId: targetRunId, category: 'STABLE_FAILURE', confidence: 90, evidence: categoryEvidence('STABLE_FAILURE', attempts, historyRuns, { fallback: true }) };
}

export function classifySnapshot(snapshot: AnalysisSnapshot, targetRunId: string): Classification[] {
  return [...new Set(snapshot.attempts.map((attempt) => attempt.testId))]
    .map((testId) => classifyTest(snapshot, testId, targetRunId));
}
