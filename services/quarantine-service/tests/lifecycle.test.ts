import { describe, expect, it } from 'vitest';
import { setQuarantine } from '../src/lifecycle.js';
import { MemoryStore, testRecord } from './helpers.js';

describe('quarantine lifecycle', () => {
  it('adds and removes quarantine state within repository scope', async () => {
    const store = new MemoryStore();
    store.tests.set('test-1', testRecord());
    await setQuarantine(store, 'acme/app', 'test-1', true, 'flaky in CI');
    expect(store.tests.get('test-1')).toMatchObject({ isQuarantined: true, quarantineReason: 'flaky in CI' });
    await setQuarantine(store, 'acme/app', 'test-1', false);
    expect(store.tests.get('test-1')).toMatchObject({ isQuarantined: false, quarantinedAt: null, quarantineReason: null });
  });

  it('cannot mutate a test belonging to another repository', async () => {
    const store = new MemoryStore();
    store.tests.set('test-1', testRecord({ repo: 'other/repo' }));
    await expect(setQuarantine(store, 'acme/app', 'test-1', true)).rejects.toThrow('not found');
  });
});
