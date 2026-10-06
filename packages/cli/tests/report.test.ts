import { describe, expect, it } from 'vitest';
import { githubMarkdown } from '../src/report.js';

describe('GitHub report formatting', () => {
  it('renders categories, confidence, waste, and dashboard link', () => {
    const result = githubMarkdown({ activeFlakes: 1, wasteSeconds: 12.4, wasteUsd: 0.00165 }, [{ testId: 't1', category: 'PROVEN_FLAKE', confidence: 100, testName: 'checkout', filePath: 'x.ts' }], 'https://flakecheck.example');
    expect(result).toContain('PROVEN_FLAKE');
    expect(result).toContain('$0.0016');
    expect(result).toContain('https://flakecheck.example');
  });
});
