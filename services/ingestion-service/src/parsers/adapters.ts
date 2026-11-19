import { createRunContext, makeAttempt, parseNumber, readChunked } from './common.js';
import type { AttemptStatus, NormalizedAttempt, ParsedIngestion, ParserMetadata } from './types.js';

export class ReportParseError extends Error {
  constructor(
    public readonly format: string,
    public readonly reason: string,
    public readonly hint?: string,
  ) {
    super(`Failed to parse ${format} report: ${reason}${hint ? ` (${hint})` : ''}`);
    this.name = 'ReportParseError';
  }
}

async function readText(stream: ReadableStream<Uint8Array>, format: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  await readChunked(stream, (chunk) => {
    text += decoder.decode(chunk, { stream: true });
  });
  text += decoder.decode();
  if (!text.trim()) {
    throw new ReportParseError(format, 'Report payload is empty', 'Ensure your test runner wrote results before invoking FlakeCheck.');
  }
  return text;
}

function safeJsonParse(text: string, format: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReportParseError(format, `Invalid JSON syntax: ${detail}`, 'Verify the file is valid JSON and not truncated.');
  }
}

function mapStatus(raw?: string): AttemptStatus {
  const normalized = (raw ?? '').toLowerCase();
  if (normalized === 'passed' || normalized === 'pass') return 'PASSED';
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'timedout' || normalized === 'interrupted') return 'FAILED';
  return 'SKIPPED';
}

/**
 * Common Test Report Format (CTRF) adapter
 * Spec: https://ctrf.io
 */
export async function parseCtrfJson(
  stream: ReadableStream<Uint8Array>,
  metadata: ParserMetadata,
): Promise<ParsedIngestion> {
  const text = await readText(stream, 'ctrf');
  const parsed = safeJsonParse(text, 'ctrf') as {
    results?: {
      tool?: { name?: string };
      tests?: Array<{
        name?: string;
        status?: string;
        duration?: number;
        filePath?: string;
        suite?: string;
        retries?: number;
        flaky?: boolean;
        message?: string;
        trace?: string;
        rawStatus?: string;
      }>;
    };
  };

  if (!parsed || typeof parsed !== 'object' || !parsed.results || !Array.isArray(parsed.results.tests)) {
    throw new ReportParseError(
      'ctrf',
      'Missing "results.tests" array',
      'Generate CTRF output with a CTRF reporter (e.g. jest-ctrf-json-reporter, playwright-ctrf-json-reporter, pytest-ctrf).',
    );
  }

  const run = await createRunContext(metadata);
  const attempts: NormalizedAttempt[] = [];
  const toolName = parsed.results.tool?.name ?? 'ctrf';

  for (const entry of parsed.results.tests) {
    if (!entry || typeof entry !== 'object') continue;
    const testName = (entry.name ?? '').trim() || 'unnamed-test';
    const filePath = entry.filePath || metadata.source_file_path || `${toolName}.ctrf.json`;
    const suiteName = entry.suite || toolName;
    const finalStatus = mapStatus(entry.status);
    const retries = parseNumber(entry.retries);
    const rawError = [entry.message, entry.trace].filter(Boolean).join('\n') || undefined;

    // If CTRF reports retries > 0 and final status is PASSED (or flaky === true),
    // materialize prior failed attempt(s) so rerun-based flakiness scoring captures the flip accurately.
    if (retries > 0 && finalStatus === 'PASSED') {
      for (let attemptNumber = 1; attemptNumber <= retries; attemptNumber += 1) {
        attempts.push(await makeAttempt(run, {
          filePath,
          suiteName,
          testName,
          status: 'FAILED',
          durationMs: Math.round(parseNumber(entry.duration) / (retries + 1)),
          rawError: rawError ?? 'Prior retry attempt failed before passing',
          attemptNumber,
        }));
      }
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName,
        testName,
        status: 'PASSED',
        durationMs: Math.round(parseNumber(entry.duration) / (retries + 1)),
        attemptNumber: retries + 1,
      }));
    } else {
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName,
        testName,
        status: finalStatus,
        durationMs: parseNumber(entry.duration),
        rawError: finalStatus === 'FAILED' ? rawError : undefined,
        attemptNumber: 1,
      }));
    }
  }

  return { run, environment: run.environment, attempts };
}

/**
 * Vitest JSON reporter adapter (`vitest run --reporter=json --outputFile=vitest-results.json`)
 */
export async function parseVitestJson(
  stream: ReadableStream<Uint8Array>,
  metadata: ParserMetadata,
): Promise<ParsedIngestion> {
  const text = await readText(stream, 'vitest');
  const parsed = safeJsonParse(text, 'vitest') as {
    testResults?: Array<{
      name?: string;
      status?: string;
      message?: string;
      assertionResults?: Array<{
        ancestorTitles?: string[];
        fullName?: string;
        title?: string;
        status?: string;
        duration?: number;
        failureMessages?: string[];
      }>;
    }>;
  };

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.testResults)) {
    throw new ReportParseError(
      'vitest',
      'Missing "testResults" array',
      'Run Vitest with "--reporter=json --outputFile=vitest-results.json".',
    );
  }

  const run = await createRunContext(metadata);
  const attempts: NormalizedAttempt[] = [];
  const seen = new Map<string, number>();

  for (const suite of parsed.testResults) {
    if (!suite || typeof suite !== 'object') continue;
    const filePath = suite.name || metadata.source_file_path || 'vitest.test.ts';
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    if (assertions.length === 0 && suite.status === 'failed') {
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName: filePath,
        testName: 'suite-load-error',
        status: 'FAILED',
        durationMs: 0,
        rawError: suite.message || 'Vitest suite failed to load',
        attemptNumber: 1,
      }));
      continue;
    }
    for (const assertion of assertions) {
      const suiteName = assertion.ancestorTitles?.join(' > ') || filePath;
      const testName = assertion.title || assertion.fullName || 'unnamed-test';
      const key = `${filePath}::${suiteName}::${testName}`;
      const attemptNumber = (seen.get(key) ?? 0) + 1;
      seen.set(key, attemptNumber);
      const status = mapStatus(assertion.status);
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName,
        testName,
        status,
        durationMs: parseNumber(assertion.duration),
        rawError: assertion.failureMessages?.length ? assertion.failureMessages.join('\n') : undefined,
        attemptNumber,
      }));
    }
  }

  return { run, environment: run.environment, attempts };
}

/**
 * Mocha JSON reporter adapter (`mocha --reporter json > mocha-results.json`)
 */
export async function parseMochaJson(
  stream: ReadableStream<Uint8Array>,
  metadata: ParserMetadata,
): Promise<ParsedIngestion> {
  const text = await readText(stream, 'mocha');
  const parsed = safeJsonParse(text, 'mocha') as {
    tests?: Array<{
      title?: string;
      fullTitle?: string;
      file?: string;
      duration?: number;
      currentRetry?: number;
      err?: { message?: string; stack?: string };
    }>;
    passes?: Array<{ fullTitle?: string; title?: string }>;
    failures?: Array<{ fullTitle?: string; title?: string }>;
    pending?: Array<{ fullTitle?: string; title?: string }>;
  };

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tests)) {
    throw new ReportParseError(
      'mocha',
      'Missing "tests" array',
      'Run Mocha with "--reporter json".',
    );
  }

  const run = await createRunContext(metadata);
  const attempts: NormalizedAttempt[] = [];
  const failureKeys = new Set((parsed.failures ?? []).map((t) => t.fullTitle ?? t.title ?? ''));
  const pendingKeys = new Set((parsed.pending ?? []).map((t) => t.fullTitle ?? t.title ?? ''));
  const seen = new Map<string, number>();

  for (const test of parsed.tests) {
    if (!test || typeof test !== 'object') continue;
    const fullTitle = (test.fullTitle ?? test.title ?? '').trim() || 'unnamed-test';
    const testName = (test.title ?? fullTitle).trim();
    const suiteName = fullTitle.endsWith(testName) && fullTitle.length > testName.length
      ? fullTitle.slice(0, fullTitle.length - testName.length).trim()
      : 'mocha';
    const filePath = test.file || metadata.source_file_path || 'mocha.test.js';
    const hasErr = Boolean(test.err && (test.err.message || test.err.stack));
    const status: AttemptStatus = hasErr || failureKeys.has(fullTitle)
      ? 'FAILED'
      : pendingKeys.has(fullTitle)
        ? 'SKIPPED'
        : 'PASSED';

    const key = `${filePath}::${suiteName}::${testName}`;
    const baseAttempt = (seen.get(key) ?? 0) + 1;
    seen.set(key, baseAttempt);

    const retries = parseNumber(test.currentRetry);
    const rawError = hasErr ? [test.err?.message, test.err?.stack].filter(Boolean).join('\n') : undefined;

    if (retries > 0 && status === 'PASSED') {
      for (let i = 1; i <= retries; i += 1) {
        attempts.push(await makeAttempt(run, {
          filePath,
          suiteName,
          testName,
          status: 'FAILED',
          durationMs: parseNumber(test.duration),
          rawError: 'Mocha retry attempt failed before passing',
          attemptNumber: i,
        }));
      }
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName,
        testName,
        status: 'PASSED',
        durationMs: parseNumber(test.duration),
        attemptNumber: retries + 1,
      }));
    } else {
      attempts.push(await makeAttempt(run, {
        filePath,
        suiteName,
        testName,
        status,
        durationMs: parseNumber(test.duration),
        rawError,
        attemptNumber: baseAttempt,
      }));
    }
  }

  return { run, environment: run.environment, attempts };
}
