import { describe, expect, it } from 'vitest';
import { classifyRootCause } from '../src/root-cause.js';
import type { AttemptSnapshot, RunSnapshot } from '../src/model.js';

const baseRun = (id: string, commitSha = 'abc1234', env = 'linux-node20'): RunSnapshot => ({
  id,
  repo: 'acme/app',
  branch: 'main',
  commitSha,
  envFingerprint: env,
  setupDurationMs: 0,
  durationMs: 1000,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('root cause classification engine', () => {
  it('classifies timing/race failures with evidence and remediation', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 5000, rawError: 'Error: Timeout 5000ms exceeded waiting for selector "#submit"' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('timing_race');
    expect(res.matchedEvidence.length).toBeGreaterThan(0);
    expect(res.remediation).toContain('timers');
  });

  it('classifies network/external service failures', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 1200, rawError: 'FetchError: request to https://api.stripe.com failed, reason: ECONNRESET' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('network_external');
    expect(res.ruleId).toBe('RC_NETWORK_EXTERNAL');
  });

  it('classifies shared state collisions', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 300, rawError: 'error: duplicate key value violates unique constraint "users_email_idx"' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('shared_state');
  });

  it('classifies resource/concurrency exhaustion', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 4000, rawError: 'FATAL ERROR: JavaScript heap out of memory (exit code 137)' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('resource_concurrency');
  });

  it('classifies test order dependency', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 100, rawError: 'AssertionError: spy already called — mock not reset between tests' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('order_dependency');
  });

  it('classifies environment differences on identical commit', () => {
    const runs = [baseRun('r1', 'deadbeef', 'ubuntu-22'), baseRun('r2', 'deadbeef', 'macos-14')];
    const attempts: AttemptSnapshot[] = [
      { id: 'a1', runId: 'r1', testId: 't1', status: 'PASSED', attemptNumber: 1, durationMs: 100 },
      { id: 'a2', runId: 'r2', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 100, rawError: 'AssertionError: path mismatch' },
    ];
    const res = classifyRootCause(attempts, runs);
    expect(res.rootCause).toBe('environment_diff');
  });

  it('returns explicit unknown when no rule matches', () => {
    const res = classifyRootCause([
      { id: 'a1', runId: 'r1', testId: 't1', status: 'FAILED', attemptNumber: 1, durationMs: 100, rawError: 'AssertionError: expected 42 to equal 43' },
    ], [baseRun('r1')]);
    expect(res.rootCause).toBe('unknown');
    expect(res.ruleId).toBe('RC_UNKNOWN');
  });
});
