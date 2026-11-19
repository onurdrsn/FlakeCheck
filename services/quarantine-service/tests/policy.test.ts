import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUARANTINE_POLICY,
  evaluateAutoQuarantine,
  evaluateCiGate,
  evaluatePolicyGraduation,
  type QuarantinePolicy,
} from '../src/policy.js';

const policy: QuarantinePolicy = {
  repo: 'acme/app',
  ...DEFAULT_QUARANTINE_POLICY,
};

describe('auto-quarantine & policy engine', () => {
  it('auto-quarantines flaky tests exceeding score, flip, and sample thresholds', () => {
    const decisions = evaluateAutoQuarantine([
      { testId: 't-flaky', flakinessScore: 78, flipCount: 3, sampleSize: 8, isQuarantined: false },
      { testId: 't-low-sample', flakinessScore: 75, flipCount: 2, sampleSize: 2, isQuarantined: false },
      { testId: 't-override', flakinessScore: 95, flipCount: 5, sampleSize: 12, isQuarantined: false, quarantineMode: 'override' },
    ], policy);

    expect(decisions.find((d) => d.testId === 't-flaky')?.action).toBe('quarantine');
    expect(decisions.find((d) => d.testId === 't-low-sample')?.action).toBe('keep');
    expect(decisions.find((d) => d.testId === 't-override')?.action).toBe('skip_override');
  });

  it('graduates quarantined tests after configured consecutive passes unless overridden', () => {
    const attempts = Array.from({ length: 10 }, (_, idx) => ({
      testId: 't1',
      repo: 'acme/app',
      commitSha: `c${idx}`,
      status: 'PASSED' as const,
      createdAt: new Date(Date.UTC(2026, 0, 1 + idx)),
    }));

    const test = {
      id: 't1',
      repo: 'acme/app',
      filePath: 'a.test.ts',
      suiteName: 'suite',
      testName: 'works',
      isQuarantined: true,
      quarantinedAt: new Date('2026-01-01T00:00:00Z'),
      quarantineReason: 'auto',
    };

    expect(evaluatePolicyGraduation(test, attempts, policy).shouldGraduate).toBe(true);
    expect(evaluatePolicyGraduation({ ...test, quarantineMode: 'override' }, attempts, policy).shouldGraduate).toBe(false);
  });

  it('enforces non-blocking quarantine mode for CI gate checks', () => {
    const quarantined = new Set(['t-flaky']);
    const nonBlocking = evaluateCiGate(['t-flaky'], quarantined, { nonBlockingMode: true });
    expect(nonBlocking.shouldFailCi).toBe(false);
    expect(nonBlocking.quarantinedFailures).toEqual(['t-flaky']);

    const withRealFailure = evaluateCiGate(['t-flaky', 't-real-bug'], quarantined, { nonBlockingMode: true });
    expect(withRealFailure.shouldFailCi).toBe(true);
    expect(withRealFailure.blockingFailures).toEqual(['t-real-bug']);

    const strict = evaluateCiGate(['t-flaky'], quarantined, { nonBlockingMode: false });
    expect(strict.shouldFailCi).toBe(true);
  });
});
