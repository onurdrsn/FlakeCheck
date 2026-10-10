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

export async function getRunDetails(db: Db, repo: string, runId: string) {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.repo, repo))).limit(1);
  if (!run) return null;

  const attempts = await db.select({
    id: testAttempts.id,
    testId: testAttempts.testId,
    attemptNumber: testAttempts.attemptNumber,
    status: testAttempts.status,
    durationMs: testAttempts.durationMs,
    failureSignature: testAttempts.failureSignature,
    rawError: testAttempts.rawError,
    createdAt: testAttempts.createdAt,
    testName: tests.testName,
    filePath: tests.filePath,
    suiteName: tests.suiteName,
  })
    .from(testAttempts)
    .innerJoin(tests, eq(testAttempts.testId, tests.id))
    .where(eq(testAttempts.runId, runId))
    .orderBy(desc(testAttempts.createdAt));

  const runClassifications = await db.select({
    testId: classifications.testId,
    category: classifications.category,
    confidence: classifications.confidence,
    evidence: classifications.evidence,
    calculatedAt: classifications.calculatedAt,
  })
    .from(classifications)
    .where(eq(classifications.runId, runId));

  const classificationMap = new Map(runClassifications.map((c) => [c.testId, c]));

  return {
    run,
    attempts: attempts.map((a) => ({
      ...a,
      classification: classificationMap.get(a.testId) ?? null,
    })),
  };
}
