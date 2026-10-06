export type AttemptStatus = 'PASSED' | 'FAILED' | 'SKIPPED';
export type ClassificationCategory =
  | 'PROVEN_FLAKE' | 'ENVIRONMENT_SENSITIVE' | 'INFRASTRUCTURE_FAILURE'
  | 'REGRESSION' | 'STABLE_FAILURE' | 'SUSPECTED_FLAKE' | 'INSUFFICIENT_DATA';

export interface RunSnapshot {
  id: string;
  repo: string;
  branch: string;
  commitSha: string;
  envFingerprint: string;
  setupDurationMs: number;
  durationMs: number;
  createdAt: Date;
  codeDiff?: boolean;
  targetBranch?: string;
}

export interface AttemptSnapshot {
  id: string;
  runId: string;
  testId: string;
  status: AttemptStatus;
  attemptNumber: number;
  durationMs: number;
  failureSignature?: string | null;
  rawError?: string | null;
}

export interface AnalysisSnapshot {
  readonly repo: string;
  readonly runs: readonly RunSnapshot[];
  readonly attempts: readonly AttemptSnapshot[];
}

export interface Classification {
  testId: string;
  runId: string;
  category: ClassificationCategory;
  confidence: number;
  evidence: Record<string, unknown>;
}

export interface SnapshotRepository {
  getSnapshot(repo: string, runId?: string, windowSize?: number): Promise<AnalysisSnapshot>;
}
