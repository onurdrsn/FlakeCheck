import { describe, expect, it } from 'vitest';
import { parseReport, ReportParseError } from '../src/parsers/index.js';

function streamFrom(content: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(content);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const meta = { repo: 'acme/app', commit_sha: 'abc1234', branch: 'main' };

describe('CTRF, Vitest, and Mocha adapters', () => {
  it('parses CTRF JSON and materializes retry attempts for flaky tests', async () => {
    const ctrf = JSON.stringify({
      results: {
        tool: { name: 'playwright' },
        tests: [
          { name: 'checkout succeeds', suite: 'checkout.spec.ts', filePath: 'e2e/checkout.spec.ts', status: 'passed', duration: 900, retries: 2, flaky: true, message: 'Timeout waiting for button' },
          { name: 'login works', suite: 'auth.spec.ts', filePath: 'e2e/auth.spec.ts', status: 'passed', duration: 120 },
        ],
      },
    });
    const parsed = await parseReport('ctrf', streamFrom(ctrf), meta);
    expect(parsed.attempts).toHaveLength(4); // 2 failed retries + 1 pass + 1 clean pass
    expect(parsed.attempts.filter((a) => a.testName === 'checkout succeeds').map((a) => a.status)).toEqual(['FAILED', 'FAILED', 'PASSED']);
  });

  it('parses Vitest JSON output including suite load failures', async () => {
    const vitest = JSON.stringify({
      testResults: [
        {
          name: 'src/cart.test.ts',
          status: 'failed',
          assertionResults: [
            { ancestorTitles: ['Cart'], title: 'calculates totals', status: 'passed', duration: 12 },
            { ancestorTitles: ['Cart'], title: 'applies coupon', status: 'failed', duration: 45, failureMessages: ['AssertionError: expected 10 to be 8'] },
          ],
        },
        {
          name: 'src/broken.test.ts',
          status: 'failed',
          message: 'SyntaxError: Unexpected token',
          assertionResults: [],
        },
      ],
    });
    const parsed = await parseReport('vitest', streamFrom(vitest), meta);
    expect(parsed.attempts).toHaveLength(3);
    expect(parsed.attempts[1]?.status).toBe('FAILED');
    expect(parsed.attempts[2]?.testName).toBe('suite-load-error');
  });

  it('parses Mocha JSON output with retries and pending tests', async () => {
    const mocha = JSON.stringify({
      tests: [
        { title: 'retries cleanly', fullTitle: 'API retries cleanly', file: 'test/api.spec.js', duration: 80, currentRetry: 1, err: {} },
        { title: 'fails hard', fullTitle: 'API fails hard', file: 'test/api.spec.js', duration: 50, err: { message: 'ECONNREFUSED', stack: 'Error: ECONNREFUSED' } },
        { title: 'skipped case', fullTitle: 'API skipped case', file: 'test/api.spec.js', duration: 0, err: {} },
      ],
      failures: [{ fullTitle: 'API fails hard' }],
      pending: [{ fullTitle: 'API skipped case' }],
    });
    const parsed = await parseReport('mocha', streamFrom(mocha), meta);
    expect(parsed.attempts.filter((a) => a.testName === 'retries cleanly').map((a) => a.status)).toEqual(['FAILED', 'PASSED']);
    expect(parsed.attempts.find((a) => a.testName === 'fails hard')?.status).toBe('FAILED');
    expect(parsed.attempts.find((a) => a.testName === 'skipped case')?.status).toBe('SKIPPED');
  });

  it('throws clear ReportParseError on malformed, empty, or unsupported payloads', async () => {
    await expect(parseReport('ctrf', streamFrom(''), meta)).rejects.toThrow(ReportParseError);
    await expect(parseReport('vitest', streamFrom('{not-json'), meta)).rejects.toThrow(/Invalid JSON syntax/);
    await expect(parseReport('mocha', streamFrom('{"wrong":true}'), meta)).rejects.toThrow(/Missing "tests" array/);
    await expect(parseReport('unknown-fmt', streamFrom('{}'), meta)).rejects.toThrow(/Unsupported ingestion format/);
  });
});
