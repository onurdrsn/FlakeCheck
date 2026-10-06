import { describe, expect, it } from 'vitest';
import { generateJestSkipList, generatePlaywrightSkipList } from '../src/skiplist.js';
import { testRecord } from './helpers.js';

describe('skip-list artifacts', () => {
  it('generates Jest testPathIgnorePatterns', () => {
    const result = generateJestSkipList([testRecord()]);
    expect(result).toEqual({ testPathIgnorePatterns: ['/tests/flaky\\.test\\.ts/'] });
  });

  it('generates Playwright grepInvert regex', () => {
    const result = generatePlaywrightSkipList([testRecord()]);
    expect(result.grepInvert).toBe('flaky event\\.ually passes'.replace('event\\.ually', 'eventually'));
  });
});
