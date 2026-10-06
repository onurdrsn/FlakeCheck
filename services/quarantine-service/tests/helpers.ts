import type { GraduationAttempt, QuarantinedTest, QuarantineStore } from '../src/model.js';

export function testRecord(overrides: Partial<QuarantinedTest> = {}): QuarantinedTest {
  return {
    id: 'test-1',
    repo: 'acme/app',
    filePath: 'tests/flaky.test.ts',
    suiteName: 'flaky',
    testName: 'eventually passes',
    isQuarantined: false,
    quarantinedAt: null,
    quarantineReason: null,
    ...overrides,
  };
}

export class MemoryStore implements QuarantineStore {
  tests = new Map<string, QuarantinedTest>();
  attempts = new Map<string, GraduationAttempt[]>();

  async findTest(repo: string, testId: string) {
    const test = this.tests.get(testId);
    return test?.repo === repo ? { ...test } : null;
  }

  async updateTest(repo: string, testId: string, update: { isQuarantined: boolean; quarantinedAt: Date | null; quarantineReason: string | null }) {
    const test = await this.findTest(repo, testId);
    if (!test) throw new Error('not found');
    this.tests.set(testId, { ...test, ...update });
  }

  async listQuarantined(repo: string) {
    return [...this.tests.values()].filter((test) => test.repo === repo && test.isQuarantined);
  }

  async listAllQuarantined() {
    return [...this.tests.values()].filter((test) => test.isQuarantined);
  }

  async listAttempts(repo: string, testId: string) {
    return (this.attempts.get(testId) ?? []).filter((attempt) => attempt.repo === repo);
  }

  async listAllQuarantinedAttempts(repo: string) {
    const tests = await this.listQuarantined(repo);
    return (await Promise.all(tests.map((test) => this.listAttempts(repo, test.id)))).flat();
  }
}

export function attempts(testId: string, repo: string, count: number, commits = 10, status: 'PASSED' | 'FAILED' = 'PASSED'): GraduationAttempt[] {
  return Array.from({ length: count }, (_, index) => ({
    testId,
    repo,
    commitSha: `commit-${index % commits}`,
    status,
    createdAt: new Date(2025, 0, 1, 0, index),
  }));
}
