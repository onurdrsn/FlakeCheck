import { describe, expect, it } from 'vitest';
import { evaluateAutoGraduation, qualifiesForGraduation } from '../src/graduation.js';
import { attempts, MemoryStore, testRecord } from './helpers.js';

describe('auto-graduation', () => {
  it('requires 50 consecutive passes across 10 commits', () => {
    expect(qualifiesForGraduation(attempts('test-1', 'acme/app', 49))).toBe(false);
    expect(qualifiesForGraduation(attempts('test-1', 'acme/app', 50, 9))).toBe(false);
    expect(qualifiesForGraduation(attempts('test-1', 'acme/app', 50, 10))).toBe(true);
  });

  it('resets the consecutive window after a failure', () => {
    const history = [
      ...attempts('test-1', 'acme/app', 10),
      { ...attempts('test-1', 'acme/app', 1, 1, 'FAILED')[0], createdAt: new Date(2025, 0, 1, 0, 10) },
      ...attempts('test-1', 'acme/app', 49).map((attempt, index) => ({ ...attempt, createdAt: new Date(2025, 0, 1, 0, 11 + index) })),
    ];
    expect(qualifiesForGraduation(history)).toBe(false);
  });

  it('graduates only qualifying quarantined tests', async () => {
    const store = new MemoryStore();
    store.tests.set('test-1', testRecord({ isQuarantined: true, quarantineReason: 'flake' }));
    store.attempts.set('test-1', attempts('test-1', 'acme/app', 50));
    expect(await evaluateAutoGraduation(store, 'acme/app')).toEqual(['test-1']);
    expect(store.tests.get('test-1')?.isQuarantined).toBe(false);
  });
});
