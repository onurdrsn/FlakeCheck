import type { EnvironmentInput } from '@flakecheck/shared-kernel';

export type AttemptStatus = 'PASSED' | 'FAILED' | 'SKIPPED';

export type ParserMetadata = Record<string, string>;

export interface NormalizedAttempt {
  id: string;
  runId: string;
  testId: string;
  repo: string;
  filePath: string;
  suiteName: string;
  testName: string;
  attemptNumber: number;
  status: AttemptStatus;
  durationMs: number;
  failureSignature: string | null;
  rawError: string | null;
}

export interface ParsedIngestion {
  run: {
    id: string;
    repo: string;
    branch: string;
    commitSha: string;
    ciWorkflow: string;
    envFingerprint: string;
    setupDurationMs: number;
    durationMs: number;
  };
  attempts: NormalizedAttempt[];
  environment: EnvironmentInput;
}
