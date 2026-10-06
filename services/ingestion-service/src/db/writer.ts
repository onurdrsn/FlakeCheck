import { classifications, runs, testAttempts, tests } from '@flakecheck/shared-kernel';
import type { ParsedIngestion } from '../parsers/index.js';

export const MAX_BATCH_SIZE = 500;

export class PartialBatchError extends Error {
  constructor(
    message: string,
    public readonly persistedRows: number,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'PartialBatchError';
  }
}

interface InsertQuery<T> {
  values(rows: T | T[]): { onConflictDoNothing(): Promise<{ rowCount?: number; rowsAffected?: number }> };
}

export interface IngestionDatabase {
  insert(table: typeof runs | typeof tests | typeof testAttempts | typeof classifications): InsertQuery<unknown>;
}

export type ClassificationInsert = {
  id: string;
  testId: string;
  runId: string;
  category: string;
  confidence: number;
  evidence: unknown;
};

export function chunks<T>(items: readonly T[], size = MAX_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error('Chunk size must be positive');
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function insertChunks<T>(
  db: IngestionDatabase,
  table: typeof tests | typeof testAttempts | typeof classifications,
  rows: T[],
): Promise<number> {
  let persistedRows = 0;
  for (const chunk of chunks(rows)) {
    try {
      const result = await db.insert(table).values(chunk).onConflictDoNothing();
      persistedRows += result.rowCount ?? result.rowsAffected ?? 0;
    } catch (error) {
      throw new PartialBatchError(`Database chunk failed after ${persistedRows} persisted rows`, persistedRows, error);
    }
  }
  return persistedRows;
}

export async function writeIngestion(db: IngestionDatabase, ingestion: ParsedIngestion): Promise<{ persistedAttempts: number }> {
  try {
    await db.insert(runs).values(ingestion.run).onConflictDoNothing();
    const testRows = [...new Map(ingestion.attempts.map((attempt) => [
      attempt.testId,
      {
        id: attempt.testId,
        repo: attempt.repo,
        filePath: attempt.filePath,
        suiteName: attempt.suiteName,
        testName: attempt.testName,
      },
    ])).values()];
    await insertChunks(db, tests, testRows);
    const attemptRows = ingestion.attempts.map((attempt) => ({
      id: attempt.id,
      runId: attempt.runId,
      testId: attempt.testId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      durationMs: attempt.durationMs,
      failureSignature: attempt.failureSignature,
      rawError: attempt.rawError,
    }));
    const persistedAttempts = await insertChunks(db, testAttempts, attemptRows);
    return { persistedAttempts };
  } catch (error) {
    if (error instanceof PartialBatchError) throw error;
    throw new PartialBatchError('Database ingestion failed', 0, error);
  }
}

export async function writeClassifications(db: IngestionDatabase, rows: ClassificationInsert[]): Promise<number> {
  return insertChunks(db, classifications, rows);
}
