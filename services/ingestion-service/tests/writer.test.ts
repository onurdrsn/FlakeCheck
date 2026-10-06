import { describe, expect, it } from 'vitest';
import { chunks, PartialBatchError, writeClassifications, writeIngestion } from '../src/db/writer.js';
import type { IngestionDatabase } from '../src/db/writer.js';
import type { ParsedIngestion } from '../src/parsers/index.js';

function ingestionWithAttempts(count: number): ParsedIngestion {
  return {
    run: { id: 'run', repo: 'acme/app', branch: 'main', commitSha: 'sha', ciWorkflow: 'ci', envFingerprint: 'env', setupDurationMs: 0, durationMs: 0 },
    environment: {},
    attempts: Array.from({ length: count }, (_, index) => ({
      id: `attempt-${index}`, runId: 'run', testId: `test-${index}`, repo: 'acme/app', filePath: `test-${index}.ts`,
      suiteName: 'suite', testName: `test-${index}`, attemptNumber: 1, status: 'PASSED' as const, durationMs: 1,
      failureSignature: null, rawError: null,
    })),
  };
}

describe('chunked database writer', () => {
  it('splits rows into batches of at most 500', () => {
    expect(chunks(Array.from({ length: 1201 }, (_, index) => index))).toHaveLength(3);
    expect(chunks(Array.from({ length: 1201 }, (_, index) => index)).map((chunk) => chunk.length)).toEqual([500, 500, 201]);
  });

  it('reports partial persistence when a later chunk fails', async () => {
    let attemptChunks = 0;
    const db: IngestionDatabase = {
      insert() {
        return {
          values() {
            return {
              async onConflictDoNothing() {
                attemptChunks += 1;
                if (attemptChunks === 3) throw new Error('database unavailable');
                return { rowCount: 500 };
              },
            };
          },
        };
      },
    };
    await expect(writeIngestion(db, ingestionWithAttempts(1001))).rejects.toMatchObject({
      name: 'PartialBatchError',
      persistedRows: 500,
    });
  });

  it('chunks classification inserts at 500 rows', async () => {
    let calls = 0;
    const db: IngestionDatabase = {
      insert() {
        return {
          values(rows) {
            expect(Array.isArray(rows) ? rows.length : 1).toBeLessThanOrEqual(500);
            return {
              async onConflictDoNothing() {
                calls += 1;
                return { rowCount: Array.isArray(rows) ? rows.length : 1 };
              },
            };
          },
        };
      },
    };
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `classification-${index}`,
      testId: `test-${index}`,
      runId: 'run',
      category: 'INSUFFICIENT_DATA',
      confidence: 0,
      evidence: {},
    }));
    expect(await writeClassifications(db, rows)).toBe(1001);
    expect(calls).toBe(3);
  });
});
