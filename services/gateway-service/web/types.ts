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

export type Summary = {
  healthScore: number;
  wasteSeconds: number;
  wasteUsd: number;
  activeFlakes: number;
  runnerCostPerMinute?: number;
  windowLabel?: string;
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

export type ApiClient = <T>(path: string, init?: RequestInit) => Promise<T>;
