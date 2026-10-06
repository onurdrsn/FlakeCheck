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

export interface AnalysisResult {
  classifiedCount: number;
  flakesFound: number;
}

export interface AnalysisSummary {
  healthScore: number;
  wasteSeconds: number;
  wasteUsd: number;
  activeFlakes: number;
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
