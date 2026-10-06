import { and, eq, inArray } from 'drizzle-orm';
import { runs, testAttempts, tests } from '@flakecheck/shared-kernel';
import type { GraduationAttempt, QuarantinedTest, QuarantineStore } from '../model.js';

type Db = {
  select(): { from(table: unknown): { where(condition: unknown): Promise<unknown[]> } };
  update(table: typeof tests): { set(values: unknown): { where(condition: unknown): Promise<unknown> } };
};

export class DrizzleQuarantineStore implements QuarantineStore {
  constructor(private readonly db: Db) {}

  async findTest(repo: string, testId: string): Promise<QuarantinedTest | null> {
    const rows = await this.db.select().from(tests).where(and(eq(tests.repo, repo), eq(tests.id, testId)));
    const row = (rows as Array<Record<string, unknown>>)[0];
    return row ? this.mapTest(row) : null;
  }

  async updateTest(repo: string, testId: string, update: { isQuarantined: boolean; quarantinedAt: Date | null; quarantineReason: string | null }): Promise<void> {
    await this.db.update(tests).set(update).where(and(eq(tests.repo, repo), eq(tests.id, testId)));
  }

  async listQuarantined(repo: string): Promise<QuarantinedTest[]> {
    const rows = await this.db.select().from(tests).where(and(eq(tests.repo, repo), eq(tests.isQuarantined, true)));
    return (rows as Array<Record<string, unknown>>).map((row) => this.mapTest(row));
  }

  async listAllQuarantined(): Promise<QuarantinedTest[]> {
    const rows = await this.db.select().from(tests).where(eq(tests.isQuarantined, true));
    return (rows as Array<Record<string, unknown>>).map((row) => this.mapTest(row));
  }

  async listAttempts(repo: string, testId: string): Promise<GraduationAttempt[]> {
    const repoRuns = await this.db.select().from(runs).where(eq(runs.repo, repo)) as Array<Record<string, unknown>>;
    const runById = new Map(repoRuns.map((run) => [String(run.id), String(run.commitSha)]));
    const runIds = [...runById.keys()];
    if (!runIds.length) return [];
    const rows = await this.db.select().from(testAttempts)
      .where(and(eq(testAttempts.testId, testId), inArray(testAttempts.runId, runIds)));
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      testId,
      repo,
      commitSha: runById.get(String(row.runId)) ?? '',
      status: String(row.status) as GraduationAttempt['status'],
      createdAt: new Date(String(row.createdAt)),
    }));
  }

  async listAllQuarantinedAttempts(repo: string): Promise<GraduationAttempt[]> {
    const testsToCheck = await this.listQuarantined(repo);
    const attempts = [];
    for (const test of testsToCheck) attempts.push(...await this.listAttempts(repo, test.id));
    return attempts;
  }

  private mapTest(row: Record<string, unknown>): QuarantinedTest {
    return {
      id: String(row.id),
      repo: String(row.repo),
      filePath: String(row.filePath),
      suiteName: String(row.suiteName),
      testName: String(row.testName),
      isQuarantined: Boolean(row.isQuarantined),
      quarantinedAt: row.quarantinedAt ? new Date(String(row.quarantinedAt)) : null,
      quarantineReason: row.quarantineReason ? String(row.quarantineReason) : null,
    };
  }
}
