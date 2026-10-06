import type { GraduationAttempt, QuarantineStore } from './model.js';

export const GRADUATION_PASS_COUNT = 50;
export const GRADUATION_COMMIT_COUNT = 10;

export function qualifiesForGraduation(attempts: readonly GraduationAttempt[]): boolean {
  let consecutivePasses = 0;
  const commits = new Set<string>();
  for (const attempt of [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (attempt.status !== 'PASSED') {
      consecutivePasses = 0;
      commits.clear();
      continue;
    }
    consecutivePasses += 1;
    commits.add(attempt.commitSha);
    if (consecutivePasses >= GRADUATION_PASS_COUNT && commits.size >= GRADUATION_COMMIT_COUNT) return true;
  }
  return false;
}

export async function evaluateAutoGraduation(store: QuarantineStore, repo: string): Promise<string[]> {
  const quarantined = await store.listQuarantined(repo);
  const graduated: string[] = [];
  for (const test of quarantined) {
    const attempts = await store.listAttempts(repo, test.id);
    if (!qualifiesForGraduation(attempts)) continue;
    await store.updateTest(repo, test.id, {
      isQuarantined: false,
      quarantinedAt: null,
      quarantineReason: null,
    });
    graduated.push(test.id);
  }
  return graduated;
}
