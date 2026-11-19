import { describe, expect, it } from 'vitest';
import { computeFlakinessScore, wilsonInterval } from '../src/scoring.js';
import type { AttemptSnapshot, RunSnapshot } from '../src/model.js';

function makeRun(id: string, commitSha: string, dayOffset: number, env = 'ubuntu-node20', codeDiff = false): RunSnapshot {
  return {
    id,
    repo: 'acme/app',
    branch: 'main',
    commitSha,
    envFingerprint: env,
    setupDurationMs: 1000,
    durationMs: 5000,
    createdAt: new Date(Date.UTC(2026, 0, 1 + dayOffset)),
    codeDiff,
  };
}

describe('statistical flakiness scoring engine', () => {
  it('computes bounded Wilson confidence intervals', () => {
    const ci = wilsonInterval(5, 10);
    expect(ci.low).toBeGreaterThan(0.2);
    expect(ci.high).toBeLessThan(0.8);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it('scores rerun-based proven flakes highly even with small sample sizes', () => {
    const runs = [makeRun('r1', 'abc111', 0)];
    const attempts: AttemptSnapshot[] = [
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 200 },
      { id: 'a2', runId: 'r1', testId: 't1', status: 'PASSED', attemptNumber: 2, durationMs: 180 },
    ];
    const result = computeFlakinessScore(attempts, runs);
    expect(result.rerunFlakeCount).toBe(1);
    expect(result.flakinessScore).toBeGreaterThanOrEqual(80);
    expect(result.isFlaky).toBe(true);
  });

  it('suppresses false positives when history sample size is below minSampleSize', () => {
    const runs = [makeRun('r1', 'c1', 0), makeRun('r2', 'c2', 1)];
    const attempts: AttemptSnapshot[] = [
      { id: 'a1', runId: 'r1', testId: 't1', status: 'PASSED', attemptNumber: 1, durationMs: 100 },
      { id: 'a2', runId: 'r2', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 100 },
    ];
    const result = computeFlakinessScore(attempts, runs, { minSampleSize: 5 });
    expect(result.meetsMinSampleSize).toBe(false);
    expect(result.isFlaky).toBe(false);
    expect(result.flakinessScore).toBeLessThan(40);
  });

  it('detects history-based intermittent flips when sample size meets threshold', () => {
    const runs = [0, 1, 2, 3, 4, 5].map((i) => makeRun(`r${i}`, `c${i}`, i));
    const statuses: Array<'PASSED' | 'FAILED'> = ['PASSED', 'FAILED', 'PASSED', 'FAILED', 'PASSED', 'FAILED'];
    const attempts: AttemptSnapshot[] = statuses.map((status, i) => ({
      id: `a${i}`,
      runId: `r${i}`,
      testId: 't1',
      status,
      attemptNumber: 1,
      durationMs: 120,
    }));
    const result = computeFlakinessScore(attempts, runs, { minSampleSize: 5 });
    expect(result.meetsMinSampleSize).toBe(true);
    expect(result.flipCount).toBe(5);
    expect(result.flipRate).toBe(1);
    expect(result.flakinessScore).toBeGreaterThanOrEqual(70);
    expect(result.isFlaky).toBe(true);
  });
});
