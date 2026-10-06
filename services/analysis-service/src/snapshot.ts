import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { runs, testAttempts } from '@flakecheck/shared-kernel';
import type { AnalysisSnapshot, AttemptSnapshot, RunSnapshot, SnapshotRepository } from './model.js';

const WINDOW_DAYS = 14;
const DEFAULT_WINDOW = 30;

type AnalysisDb = {
  select(): {
    from(table: typeof runs | typeof testAttempts): {
      where(condition: unknown): {
        orderBy(...columns: unknown[]): {
          limit(count: number): Promise<unknown[]>;
        };
        then<TResult1 = unknown[], TResult2 = never>(onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
      };
      orderBy(...columns: unknown[]): {
        limit(count: number): Promise<unknown[]>;
      };
    };
  };
};

export class DrizzleSnapshotRepository implements SnapshotRepository {
  constructor(private readonly db: AnalysisDb) {}

  async getSnapshot(repo: string, runId?: string, windowSize = DEFAULT_WINDOW): Promise<AnalysisSnapshot> {
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [dateRows, latestRows] = await Promise.all([
      this.db.select().from(runs)
      .where(and(eq(runs.repo, repo), gte(runs.createdAt, cutoff)))
      .orderBy(desc(runs.createdAt))
      .limit(Math.max(1, windowSize)),
      this.db.select().from(runs)
        .where(eq(runs.repo, repo))
        .orderBy(desc(runs.createdAt))
        .limit(Math.max(1, windowSize)),
    ]);
    const typedRuns = [...new Map(
      [...dateRows, ...latestRows].map((row) => [String((row as Record<string, unknown>).id), row]),
    ).values()] as Array<Record<string, unknown>>;
    const selectedRunIds = typedRuns.map((row) => String(row.id));
    if (runId && !selectedRunIds.includes(runId)) selectedRunIds.push(runId);
    const attemptRows = selectedRunIds.length
      ? await this.db.select().from(testAttempts).where(inArray(testAttempts.runId, selectedRunIds))
      : [];
    const snapshot: AnalysisSnapshot = {
      repo,
      runs: typedRuns.map((row) => ({
        id: String(row.id),
        repo: String(row.repo),
        branch: String(row.branch),
        commitSha: String(row.commitSha),
        envFingerprint: String(row.envFingerprint),
        setupDurationMs: Number(row.setupDurationMs ?? 0),
        durationMs: Number(row.durationMs ?? 0),
        createdAt: new Date(String(row.createdAt)),
      })) as readonly RunSnapshot[],
      attempts: (attemptRows as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        runId: String(row.runId),
        testId: String(row.testId),
        status: String(row.status) as AttemptSnapshot['status'],
        attemptNumber: Number(row.attemptNumber ?? 1),
        durationMs: Number(row.durationMs ?? 0),
        failureSignature: row.failureSignature as string | null | undefined,
        rawError: row.rawError as string | null | undefined,
      })) as readonly AttemptSnapshot[],
    };
    return Object.freeze({
      repo: snapshot.repo,
      runs: Object.freeze([...snapshot.runs]),
      attempts: Object.freeze([...snapshot.attempts]),
    });
  }
}
