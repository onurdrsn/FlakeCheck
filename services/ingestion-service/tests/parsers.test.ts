import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseReport } from '../src/parsers/index.js';
import type { ParserMetadata } from '../src/parsers/index.js';

const root = new URL('./fixtures/', import.meta.url);
const metadata: ParserMetadata = {
  repo: 'acme/app',
  branch: 'main',
  commit_sha: 'abc123',
  ci_workflow_name: 'ci',
  run_attempt_number: '1',
  env: 'os=linux,runtime_name=node.js',
};

async function streamFixture(name: string): Promise<ReadableStream<Uint8Array>> {
  const bytes = new Uint8Array(await readFile(new URL(name, root)));
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  });
}

describe('streaming report parsers', () => {
  it.each([
    ['junit', 'junit.xml', 2],
    ['jest', 'jest.json', 2],
    ['playwright', 'playwright.json', 1],
    ['pytest', 'pytest.json', 2],
    ['go', 'go.jsonl', 2],
  ] as const)('parses %s incrementally', async (format, fixture, expectedCount) => {
    const result = await parseReport(format, await streamFixture(fixture), metadata);
    expect(result.attempts).toHaveLength(expectedCount);
    expect(result.run.id).toMatch(/^[0-9a-f]{64}$/);
    expect(result.attempts.every((attempt) => /^[0-9a-f]{64}$/.test(attempt.id))).toBe(true);
    expect(result.attempts.some((attempt) => attempt.status === 'FAILED')).toBe(format !== 'playwright');
  });

  it('scrubs failure payloads before storing or signing them', async () => {
    const result = await parseReport('jest', await streamFixture('jest.json'), metadata);
    const failed = result.attempts.find((attempt) => attempt.status === 'FAILED');
    expect(failed?.rawError).toContain('<REDACTED>');
    expect(failed?.rawError).not.toContain('secret-value');
    expect(failed?.failureSignature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives a stable run identity when local reports have no CI metadata', async () => {
    const localMetadata: ParserMetadata = { repo: 'acme/app' };
    const first = await parseReport('junit', await streamFixture('junit.xml'), localMetadata);
    const second = await parseReport('junit', await streamFixture('junit.xml'), localMetadata);
    expect(first.run.id).toBe(second.run.id);
    expect(first.run.id).toMatch(/^[0-9a-f]{64}$/);
  });
});
