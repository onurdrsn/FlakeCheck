export type Flake = {
  testId: string;
  runId: string;
  category: string;
  confidence: number;
  evidence: Record<string, unknown>;
  filePath: string;
  suiteName: string;
  testName: string;
};

export type SummaryRun = {
  id: string;
  branch?: string;
  commitSha: string;
  createdAt: string | Date;
  totalAttempts?: number;
  passedAttempts?: number;
  failedAttempts?: number;
};

export type Summary = {
  healthScore: number;
  wasteSeconds: number;
  wasteUsd: number;
  activeFlakes: number;
  defaultBranch?: string | null;
  lastBranch?: string | null;
  runnerCostPerMinute?: number;
  windowLabel?: string;
  totalRuns?: number;
  totalAttempts?: number;
  classifiedTests?: number;
  cleanTests?: number;
  lastRunId?: string | null;
  lastCommitSha?: string | null;
  lastAnalyzedAt?: string | Date | null;
  recentRuns?: SummaryRun[];
};

export type TimelineItem = {
  attempt: {
    status: string;
    durationMs?: number | null;
  };
  run: {
    id: string;
    commitSha: string;
    createdAt: string | Date;
  };
};

export type RunDetailAttempt = {
  id: string;
  runId?: string;
  testId: string;
  attemptNumber: number;
  status: string;
  durationMs: number;
  failureSignature?: string | null;
  rawError?: string | null;
  createdAt: string | Date;
  testName: string;
  filePath: string;
  suiteName: string;
  classification?: {
    category: string;
    confidence: number;
    evidence: Record<string, unknown>;
  } | null;
};

export type RunDetails = {
  run: {
    id: string;
    repo: string;
    branch: string;
    commitSha: string;
    ciWorkflow: string;
    envFingerprint: string;
    createdAt: string | Date;
  };
  runs?: SummaryRun[];
  attempts: RunDetailAttempt[];
};

export type ApiClient = <T>(path: string, init?: RequestInit) => Promise<T>;

