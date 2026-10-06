import { classifications } from '@flakecheck/shared-kernel';
import type { Classification } from '../model.js';

export const MAX_BATCH_SIZE = 500;
export function chunks<T>(items: readonly T[], size = MAX_BATCH_SIZE): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

export async function writeClassifications(db: { insert(table: typeof classifications): { values(rows: unknown[]): { onConflictDoNothing(): Promise<{ rowCount?: number }> } } }, values: Classification[]): Promise<number> {
  let persisted = 0;
  for (const chunk of chunks(values)) {
    const result = await db.insert(classifications).values(chunk.map((value) => ({
      id: `${value.testId}:${value.runId}`,
      testId: value.testId,
      runId: value.runId,
      category: value.category,
      confidence: value.confidence,
      evidence: value.evidence,
    }))).onConflictDoNothing();
    persisted += result.rowCount ?? 0;
  }
  return persisted;
}
