export interface QuarantinedTest {
  id: string;
  repo: string;
  filePath: string;
  suiteName: string;
  testName: string;
  isQuarantined: boolean;
  quarantinedAt: Date | null;
  quarantineReason: string | null;
}

export interface GraduationAttempt {
  testId: string;
  repo: string;
  commitSha: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  createdAt: Date;
}

export interface QuarantineStore {
  findTest(repo: string, testId: string): Promise<QuarantinedTest | null>;
  updateTest(repo: string, testId: string, update: { isQuarantined: boolean; quarantinedAt: Date | null; quarantineReason: string | null }): Promise<void>;
  listQuarantined(repo: string): Promise<QuarantinedTest[]>;
  listAllQuarantined(): Promise<QuarantinedTest[]>;
  listAttempts(repo: string, testId: string): Promise<GraduationAttempt[]>;
  listAllQuarantinedAttempts(repo: string): Promise<GraduationAttempt[]>;
}
