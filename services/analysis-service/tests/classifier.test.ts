import { describe, expect, it } from 'vitest';
import { classifyTest, classifySnapshot } from '../src/classifier.js';
import type { AnalysisSnapshot, AttemptSnapshot, RunSnapshot } from '../src/model.js';

function run(id: string, commitSha: string, envFingerprint = 'linux', codeDiff = false, branch = 'main'): RunSnapshot {
  return { id, repo: 'acme/app', branch, commitSha, envFingerprint, setupDurationMs: 1000, durationMs: 1000, createdAt: new Date(`2025-01-${String(Number(id.slice(1)) + 1).padStart(2, '0')}T00:00:00Z`), codeDiff };
}

function attempt(id: string, runId: string, testId: string, status: 'PASSED' | 'FAILED', n = 1, rawError?: string): AttemptSnapshot {
  return { id, runId, testId, status, attemptNumber: n, durationMs: 100, ...(rawError ? { rawError } : {}) };
}

function snapshot(runs: RunSnapshot[], attempts: AttemptSnapshot[]): AnalysisSnapshot {
  return Object.freeze({ repo: 'acme/app', runs: Object.freeze(runs), attempts: Object.freeze(attempts) });
}

describe('deterministic classification precedence', () => {
  it('classifies proven flakes first', () => {
    const s = snapshot([run('r1', 'c1'), run('r2', 'c1')], [
      attempt('a1', 'r1', 't', 'FAILED'), attempt('a2', 'r2', 't', 'PASSED'),
    ]);
    expect(classifyTest(s, 't', 'r2').category).toBe('PROVEN_FLAKE');
    expect(classifyTest(s, 't', 'r2').confidence).toBe(100);
  });

  it('classifies environment sensitivity before infrastructure and flake rules', () => {
    const s = snapshot([run('r1', 'c1', 'linux'), run('r2', 'c1', 'windows')], [
      attempt('a1', 'r1', 't', 'PASSED'), attempt('a2', 'r2', 't', 'FAILED', 1, 'ECONNREFUSED'),
    ]);
    expect(classifyTest(s, 't', 'r2').category).toBe('ENVIRONMENT_SENSITIVE');
  });

  it('classifies infrastructure signatures at precedence level three', () => {
    const s = snapshot([run('r1', 'c1')], [attempt('a1', 'r1', 't', 'FAILED', 1, 'ETIMEDOUT')]);
    expect(classifyTest(s, 't', 'r1').category).toBe('INFRASTRUCTURE_FAILURE');
  });

  it('classifies regressions after five passing runs and a diff', () => {
    const runs = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, i) => run(id, `c${i}`, 'linux', id === 'r6'));
    const attempts = runs.slice(0, 5).map((item, i) => attempt(`a${i}`, item.id, 't', 'PASSED'));
    attempts.push(attempt('a6', 'r6', 't', 'FAILED', 1), attempt('a7', 'r6', 't', 'FAILED', 2));
    expect(classifyTest(snapshot(runs, attempts), 't', 'r6').category).toBe('REGRESSION');
  });

  it('classifies stable failures across three commits', () => {
    const runs = [run('r1', 'c1'), run('r2', 'c2'), run('r3', 'c3')];
    expect(classifyTest(snapshot(runs, runs.map((item, i) => attempt(`a${i}`, item.id, 't', 'FAILED'))), 't', 'r3').category).toBe('STABLE_FAILURE');
  });

  it('classifies suspected flakes from unchanged-run flips', () => {
    const runs = [run('r1', 'c1'), run('r2', 'c2'), run('r3', 'c3')];
    const attempts = [attempt('a1', 'r1', 't', 'PASSED'), attempt('a2', 'r2', 't', 'FAILED'), attempt('a3', 'r3', 't', 'PASSED')];
    expect(classifyTest(snapshot(runs, attempts), 't', 'r3').category).toBe('SUSPECTED_FLAKE');
  });

  it('returns insufficient data below three historical runs and emits one result per test', () => {
    const s = snapshot([run('r1', 'c1')], [attempt('a1', 'r1', 't', 'PASSED')]);
    expect(classifyTest(s, 't', 'r1').category).toBe('INSUFFICIENT_DATA');
    expect(classifySnapshot(s, 'r1')).toHaveLength(1);
  });
});
