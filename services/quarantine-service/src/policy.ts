import type { GraduationAttempt, QuarantinedTest } from './model.js';

export interface QuarantinePolicy {
  repo: string;
  enabled: boolean;
  flakinessScoreThreshold: number;
  minFlipCount: number;
  minSampleSize: number;
  autoGraduatePasses: number;
  nonBlockingMode: boolean;
}

export const DEFAULT_QUARANTINE_POLICY: Omit<QuarantinePolicy, 'repo'> = {
  enabled: true,
  flakinessScoreThreshold: 60,
  minFlipCount: 2,
  minSampleSize: 5,
  autoGraduatePasses: 10,
  nonBlockingMode: true,
};

export interface QuarantineCandidate {
  testId: string;
  flakinessScore: number;
  flipCount: number;
  sampleSize: number;
  isQuarantined: boolean;
  quarantineMode?: 'manual' | 'auto' | 'override';
  owner?: string | null;
}

export interface PolicyDecision {
  testId: string;
  action: 'quarantine' | 'keep' | 'skip_override';
  reason: string;
  flakinessScore: number;
}

export interface QuarantineHistoryEntry {
  id: string;
  repo: string;
  testId: string;
  action: 'quarantined' | 'graduated' | 'overridden';
  mode: 'auto' | 'manual';
  actor: string;
  owner: string | null;
  reason: string;
  flakinessScore: number | null;
  createdAt: Date;
}

export function evaluateAutoQuarantine(
  candidates: readonly QuarantineCandidate[],
  policy: QuarantinePolicy,
): PolicyDecision[] {
  if (!policy.enabled) {
    return candidates.map((c) => ({
      testId: c.testId,
      action: 'keep',
      reason: 'Auto-quarantine policy is disabled for this repository',
      flakinessScore: c.flakinessScore,
    }));
  }

  return candidates.map((candidate) => {
    if (candidate.quarantineMode === 'override') {
      return {
        testId: candidate.testId,
        action: 'skip_override',
        reason: 'Manual override active — auto-quarantine skipped',
        flakinessScore: candidate.flakinessScore,
      };
    }

    if (candidate.isQuarantined) {
      return {
        testId: candidate.testId,
        action: 'keep',
        reason: 'Already quarantined',
        flakinessScore: candidate.flakinessScore,
      };
    }

    const meetsScore = candidate.flakinessScore >= policy.flakinessScoreThreshold;
    const meetsFlips = candidate.flipCount >= policy.minFlipCount;
    const meetsSamples = candidate.sampleSize >= policy.minSampleSize;

    if (meetsScore && meetsFlips && meetsSamples) {
      return {
        testId: candidate.testId,
        action: 'quarantine',
        reason: `Auto-quarantined: flakiness score ${candidate.flakinessScore} >= ${policy.flakinessScoreThreshold}, flips ${candidate.flipCount} >= ${policy.minFlipCount} (n=${candidate.sampleSize})`,
        flakinessScore: candidate.flakinessScore,
      };
    }

    return {
      testId: candidate.testId,
      action: 'keep',
      reason: `Below policy threshold (score=${candidate.flakinessScore}/${policy.flakinessScoreThreshold}, flips=${candidate.flipCount}/${policy.minFlipCount}, n=${candidate.sampleSize}/${policy.minSampleSize})`,
      flakinessScore: candidate.flakinessScore,
    };
  });
}

export function evaluatePolicyGraduation(
  test: QuarantinedTest & { quarantineMode?: 'manual' | 'auto' | 'override' },
  attempts: readonly GraduationAttempt[],
  policy: QuarantinePolicy,
): { shouldGraduate: boolean; consecutivePasses: number; reason: string } {
  if (!test.isQuarantined) {
    return { shouldGraduate: false, consecutivePasses: 0, reason: 'Test is not quarantined' };
  }
  if (test.quarantineMode === 'override') {
    return { shouldGraduate: false, consecutivePasses: 0, reason: 'Manual override prevents auto-graduation' };
  }

  const ordered = [...attempts]
    .filter((a) => a.status !== 'SKIPPED')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let consecutivePasses = 0;
  for (const attempt of ordered) {
    if (attempt.status === 'PASSED') {
      consecutivePasses += 1;
    } else {
      break;
    }
  }

  const shouldGraduate = consecutivePasses >= policy.autoGraduatePasses;
  return {
    shouldGraduate,
    consecutivePasses,
    reason: shouldGraduate
      ? `Auto-graduated after ${consecutivePasses} consecutive passes (threshold: ${policy.autoGraduatePasses})`
      : `${consecutivePasses}/${policy.autoGraduatePasses} consecutive passes`,
  };
}

/**
 * Determines whether CI should fail given failed tests and active quarantine set.
 * When `policy.nonBlockingMode` is true, failures exclusively inside quarantined tests
 * are reported as warnings and do not block the CI pipeline.
 */
export function evaluateCiGate(
  failedTestIds: readonly string[],
  quarantinedTestIds: ReadonlySet<string>,
  policy: Pick<QuarantinePolicy, 'nonBlockingMode'>,
): { shouldFailCi: boolean; blockingFailures: string[]; quarantinedFailures: string[] } {
  const quarantinedFailures = failedTestIds.filter((id) => quarantinedTestIds.has(id));
  const blockingFailures = policy.nonBlockingMode
    ? failedTestIds.filter((id) => !quarantinedTestIds.has(id))
    : [...failedTestIds];

  return {
    shouldFailCi: blockingFailures.length > 0,
    blockingFailures,
    quarantinedFailures,
  };
}
