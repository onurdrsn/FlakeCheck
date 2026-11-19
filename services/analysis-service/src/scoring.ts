import type { AttemptSnapshot, RunSnapshot } from './model.js';

export interface ScoringConfig {
  /** Minimum number of non-skipped observations required before history-only flakiness scores high */
  minSampleSize: number;
  /** Weight (0-1) applied to rerun-based flakiness signal */
  rerunWeight: number;
  /** Weight (0-1) applied to cross-run history flip-rate signal */
  historyWeight: number;
  /** Z-score for Wilson confidence interval (1.96 = 95% CI) */
  zScore: number;
  /** Minimum composite score (0-100) to mark a test as statistically flaky */
  flakyScoreThreshold: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  minSampleSize: 5,
  rerunWeight: 0.65,
  historyWeight: 0.35,
  zScore: 1.96,
  flakyScoreThreshold: 35,
};

export interface ConfidenceInterval {
  low: number;
  high: number;
}

export interface FlakinessScoreResult {
  flakinessScore: number;
  flipRate: number;
  rerunFlakeRate: number;
  passCount: number;
  failCount: number;
  sampleSize: number;
  flipCount: number;
  rerunFlakeCount: number;
  confidenceInterval: ConfidenceInterval;
  meetsMinSampleSize: boolean;
  isFlaky: boolean;
}

/**
 * Wilson score confidence interval for a binomial proportion (e.g. failure or flip rate).
 * Resistant to extreme small-sample distortion unlike normal approximation.
 */
export function wilsonInterval(successes: number, total: number, z = 1.96): ConfidenceInterval {
  if (total <= 0) return { low: 0, high: 0 };
  const p = Math.max(0, Math.min(1, successes / total));
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return {
    low: Math.max(0, Math.round(((center - half) / denom) * 10000) / 10000),
    high: Math.min(1, Math.round(((center + half) / denom) * 10000) / 10000),
  };
}

export function computeFlakinessScore(
  attempts: readonly AttemptSnapshot[],
  runs: readonly RunSnapshot[],
  partialConfig: Partial<ScoringConfig> = {},
): FlakinessScoreResult {
  const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...partialConfig };
  const orderedRuns = [...runs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const nonSkipped = attempts.filter((a) => a.status !== 'SKIPPED');
  const passCount = nonSkipped.filter((a) => a.status === 'PASSED').length;
  const failCount = nonSkipped.filter((a) => a.status === 'FAILED').length;
  const sampleSize = nonSkipped.length;

  // Group attempts by run
  const byRun = new Map<string, AttemptSnapshot[]>();
  for (const attempt of nonSkipped) {
    byRun.set(attempt.runId, [...(byRun.get(attempt.runId) ?? []), attempt]);
  }

  // 1. Rerun-based detection: same run or same (commitSha + envFingerprint) has both PASSED and FAILED
  const byCommitEnv = new Map<string, AttemptSnapshot[]>();
  for (const run of orderedRuns) {
    const runAttempts = byRun.get(run.id) ?? [];
    if (runAttempts.length === 0) continue;
    const key = `${run.commitSha}:${run.envFingerprint}`;
    byCommitEnv.set(key, [...(byCommitEnv.get(key) ?? []), ...runAttempts]);
  }

  let rerunGroupsWithRetries = 0;
  let rerunFlakeCount = 0;
  for (const group of byCommitEnv.values()) {
    if (group.length >= 2) {
      rerunGroupsWithRetries += 1;
      const hasPass = group.some((a) => a.status === 'PASSED');
      const hasFail = group.some((a) => a.status === 'FAILED');
      if (hasPass && hasFail) {
        rerunFlakeCount += 1;
      }
    }
  }
  const rerunFlakeRate = rerunGroupsWithRetries > 0 ? rerunFlakeCount / rerunGroupsWithRetries : 0;

  // 2. History-based detection: outcome transitions across consecutive runs without code diff
  const runOutcomes: Array<{ outcome: 'PASSED' | 'FAILED'; codeDiff: boolean }> = [];
  for (const run of orderedRuns) {
    const group = byRun.get(run.id) ?? [];
    if (group.length === 0) continue;
    // A run is considered PASSED if any attempt passed (standard CI retry semantics)
    const outcome = group.some((a) => a.status === 'PASSED') ? 'PASSED' : 'FAILED';
    runOutcomes.push({ outcome, codeDiff: Boolean(run.codeDiff) });
  }

  let transitions = 0;
  let flipCount = 0;
  for (let i = 1; i < runOutcomes.length; i += 1) {
    const prev = runOutcomes[i - 1];
    const curr = runOutcomes[i];
    if (!prev || !curr) continue;
    transitions += 1;
    if (prev.outcome !== curr.outcome && !curr.codeDiff) {
      flipCount += 1;
    }
  }
  const flipRate = transitions > 0 ? flipCount / transitions : 0;

  // 3. Confidence interval on the observed instability rate
  const instabilityEvents = rerunFlakeCount + flipCount;
  const instabilityTrials = Math.max(1, rerunGroupsWithRetries + transitions);
  const confidenceInterval = sampleSize > 0
    ? wilsonInterval(instabilityEvents, instabilityTrials, config.zScore)
    : { low: 0, high: 0 };

  // 4. Composite 0-100 flakiness score combining rerun + history signals with sample-size damping
  const meetsMinSampleSize = sampleSize >= config.minSampleSize;
  const sampleDamping = rerunFlakeCount > 0
    ? 1 // A proven same-commit rerun flip is definitive even on small sample sizes
    : Math.min(1, sampleSize / Math.max(1, config.minSampleSize));

  // Normalize rerun signal (even a single proven rerun flake contributes strongly)
  const rerunSignal = rerunFlakeCount > 0 ? Math.min(1, 0.7 + rerunFlakeRate * 0.3) : 0;
  // Normalize history signal (flipRate >= 0.5 saturates history instability)
  const historySignal = Math.min(1, flipRate * 2);

  // If both signals exist, combine with configured weights; if only one exists, scale appropriately
  let rawScore = 0;
  if (rerunSignal > 0 && historySignal > 0) {
    rawScore = rerunSignal * config.rerunWeight + historySignal * config.historyWeight;
  } else if (rerunSignal > 0) {
    rawScore = Math.max(rerunSignal * 0.85, rerunSignal * config.rerunWeight + 0.2);
  } else if (historySignal > 0) {
    rawScore = historySignal * 0.75 * sampleDamping;
  }

  const flakinessScore = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
  const isFlaky = (meetsMinSampleSize || rerunFlakeCount > 0) && flakinessScore >= config.flakyScoreThreshold;

  return {
    flakinessScore,
    flipRate: Math.round(flipRate * 10000) / 10000,
    rerunFlakeRate: Math.round(rerunFlakeRate * 10000) / 10000,
    passCount,
    failCount,
    sampleSize,
    flipCount,
    rerunFlakeCount,
    confidenceInterval,
    meetsMinSampleSize,
    isFlaky,
  };
}
