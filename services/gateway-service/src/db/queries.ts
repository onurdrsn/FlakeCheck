import { and, desc, eq, inArray } from 'drizzle-orm';
import { classifications, runs, testAttempts, tests } from '@flakecheck/shared-kernel';

type Db = ReturnType<typeof import('./client.js').createDatabase>;

export async function listFlakes(db: Db, repo: string, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const rows = await db.select({
    testId: classifications.testId,
    runId: classifications.runId,
    category: classifications.category,
    confidence: classifications.confidence,
    evidence: classifications.evidence,
    filePath: tests.filePath,
    suiteName: tests.suiteName,
    testName: tests.testName,
  }).from(classifications)
    .innerJoin(tests, eq(classifications.testId, tests.id))
    .innerJoin(runs, eq(classifications.runId, runs.id))
    .where(and(eq(runs.repo, repo), inArray(classifications.category, ['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE'])))
    .orderBy(desc(classifications.calculatedAt))
    .limit(pageSize)
    .offset(offset);
  return rows;
}

export async function testTimeline(db: Db, repo: string, testId: string) {
  const rows = await db.select({
    attempt: testAttempts,
    run: runs,
  }).from(testAttempts)
    .innerJoin(runs, eq(testAttempts.runId, runs.id))
    .where(and(eq(testAttempts.testId, testId), eq(runs.repo, repo)))
    .orderBy(desc(runs.createdAt));
  return rows;
}
