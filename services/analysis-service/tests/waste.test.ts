import { describe, expect, it } from 'vitest';
import { calculateWaste } from '../src/waste.js';
import type { AnalysisSnapshot } from '../src/model.js';

describe('CI waste calculation', () => {
  it('uses attempt durations plus run setup duration for retried runs', () => {
    const snapshot: AnalysisSnapshot = {
      repo: 'acme/app',
      runs: [
        { id: 'r1', repo: 'acme/app', branch: 'main', commitSha: 'c1', envFingerprint: 'e', setupDurationMs: 2000, durationMs: 9000, createdAt: new Date() },
      ],
      attempts: [
        { id: 'a1', runId: 'r1', testId: 't', status: 'FAILED', attemptNumber: 1, durationMs: 3000 },
        { id: 'a2', runId: 'r1', testId: 't', status: 'FAILED', attemptNumber: 2, durationMs: 4000 },
      ],
    };
    const result = calculateWaste(snapshot, new Set(['r1']));
    expect(result.wasteSeconds).toBe(9);
    expect(result.wasteUsd).toBeCloseTo(0.0012);
  });

  it('does not infer setup time from test duration when setup is unavailable', () => {
    const snapshot: AnalysisSnapshot = {
      repo: 'acme/app',
      runs: [{ id: 'r1', repo: 'acme/app', branch: 'main', commitSha: 'c1', envFingerprint: 'e', setupDurationMs: 0, durationMs: 999999, createdAt: new Date() }],
      attempts: [{ id: 'a1', runId: 'r1', testId: 't', status: 'FAILED', attemptNumber: 2, durationMs: 1000 }],
    };
    expect(calculateWaste(snapshot, new Set(['r1'])).wasteSeconds).toBe(1);
  });
});
