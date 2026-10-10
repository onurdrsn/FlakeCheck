export interface IngestionMetadata extends Record<string, string> {
  repo: string;
}

export interface IngestionResult {
  runId: string;
  ingestedAttempts: number;
}

export interface IngestionRPC {
  ingestStream(format: string, metadata: IngestionMetadata, payloadStream: ReadableStream<Uint8Array>): Promise<IngestionResult>;
}

export interface AnalysisRunInfo {
  id: string;
  commitSha: string;
  createdAt: string | Date;
  totalAttempts?: number;
  passedAttempts?: number;
  failedAttempts?: number;
}

export interface AnalysisResult {
  classifiedCount: number;
  flakesFound: number;
  runId?: string;
  windowSize?: number;
  runsAnalyzed?: number;
  attemptsAnalyzed?: number;
  cleanCount?: number;
  breakdown?: Record<string, number>;
  latestRun?: AnalysisRunInfo | null;
}

export interface AnalysisSummary {
  healthScore: number;
  wasteSeconds: number;
  wasteUsd: number;
  activeFlakes: number;
  totalRuns?: number;
  totalAttempts?: number;
  classifiedTests?: number;
  cleanTests?: number;
  lastRunId?: string | null;
  lastCommitSha?: string | null;
  lastAnalyzedAt?: string | Date | null;
  recentRuns?: AnalysisRunInfo[];
}

export interface AnalysisRPC {
  analyzeRun(repo: string, runId: string, options?: { windowSize?: number }): Promise<AnalysisResult>;
  calculateSummary(repo: string): Promise<AnalysisSummary>;
}

export interface QuarantineRPC {
  setQuarantine(repo: string, testId: string, state: boolean, reason?: string): Promise<void>;
  evaluateAutoGraduation(repo: string): Promise<{ graduatedTestIds: string[] }>;
  generateSkipList(repo: string, framework: 'jest' | 'playwright'): Promise<Record<string, unknown>>;
}
