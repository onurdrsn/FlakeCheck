import type { AnalysisSnapshot } from './model.js';

export interface WasteResult {
  wasteSeconds: number;
  wasteUsd: number;
}

export function calculateWaste(snapshot: AnalysisSnapshot, flakyRunIds: ReadonlySet<string>, costPerRunnerMinute = 0.008): WasteResult {
  const flakyAttempts = snapshot.attempts.filter((attempt) => flakyRunIds.has(attempt.runId));
  const attemptSeconds = flakyAttempts.reduce((sum, attempt) => sum + attempt.durationMs / 1000, 0);
  const retriedRunIds = new Set(flakyAttempts.filter((attempt) => attempt.attemptNumber > 1).map((attempt) => attempt.runId));
  const setupSeconds = snapshot.runs
    .filter((run) => retriedRunIds.has(run.id))
    .reduce((sum, run) => sum + (run.setupDurationMs || 0) / 1000, 0);
  const wasteSeconds = attemptSeconds + setupSeconds;
  return { wasteSeconds, wasteUsd: (wasteSeconds / 60) * costPerRunnerMinute };
}
