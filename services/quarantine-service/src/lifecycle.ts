import type { QuarantineStore } from './model.js';

export async function setQuarantine(
  store: QuarantineStore,
  repo: string,
  testId: string,
  state: boolean,
  reason?: string,
): Promise<void> {
  const test = await store.findTest(repo, testId);
  if (!test) throw new Error(`Test ${testId} was not found in repository ${repo}`);
  await store.updateTest(repo, testId, state
    ? { isQuarantined: true, quarantinedAt: test.quarantinedAt ?? new Date(), quarantineReason: reason ?? test.quarantineReason ?? 'manual quarantine' }
    : { isQuarantined: false, quarantinedAt: null, quarantineReason: null });
}
