import type { QuarantinedTest } from './model.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateJestSkipList(tests: readonly QuarantinedTest[]): Record<string, unknown> {
  return {
    testPathIgnorePatterns: tests.map((test) => `/${escapeRegex(test.filePath)}/`),
  };
}

export function generatePlaywrightSkipList(tests: readonly QuarantinedTest[]): Record<string, unknown> {
  const names = tests.map((test) => `${test.suiteName} ${test.testName}`.trim()).filter(Boolean);
  return {
    grepInvert: names.length ? new RegExp(names.map(escapeRegex).join('|')).source : '(?!)',
  };
}

export function generateSkipList(tests: readonly QuarantinedTest[], framework: 'jest' | 'playwright'): Record<string, unknown> {
  return framework === 'jest' ? generateJestSkipList(tests) : generatePlaywrightSkipList(tests);
}
