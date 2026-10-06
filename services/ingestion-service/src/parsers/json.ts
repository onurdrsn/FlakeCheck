import { JSONParser } from '@streamparser/json';
import { readChunked, createRunContext, makeAttempt, parseNumber } from './common.js';
import type { NormalizedAttempt, ParsedIngestion, ParserMetadata } from './types.js';

async function parseJsonStream(stream: ReadableStream<Uint8Array>, path: string): Promise<unknown[]> {
  const parser = new JSONParser({ paths: [path] });
  const values: unknown[] = [];
  let error: Error | undefined;
  parser.onValue = (element: { parent?: unknown; value?: unknown }) => {
    if (element.value !== undefined) values.push(element.value);
  };
  parser.onError = (value: Error) => { error = value; };
  await readChunked(stream, (chunk) => parser.write(chunk));
  parser.end();
  if (error && values.length === 0) throw error;
  return values;
}

function statusOf(value: unknown): 'PASSED' | 'FAILED' | 'SKIPPED' {
  const status = String(value ?? '').toLowerCase();
  if (status.includes('skip') || status.includes('pending') || status.includes('todo')) return 'SKIPPED';
  return status.includes('pass') || status === 'passed' || status === 'ok' ? 'PASSED' : 'FAILED';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function parseJestJson(stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const context = await createRunContext(metadata);
  const results = await parseJsonStream(stream, '$.testResults.*');
  const attempts: NormalizedAttempt[] = [];
  for (const value of results) {
    const item = asRecord(value);
    const failures = asArray(item.failureMessages).map(String).join('\n');
    attempts.push(await makeAttempt(context, {
      filePath: String(item.testFilePath ?? metadata.source_file_path ?? '<unknown>'),
      suiteName: asArray(item.ancestorTitles).map(String).join('/'),
      testName: String(item.title ?? item.fullName ?? item.name ?? '<unnamed>'),
      status: statusOf(item.status),
      durationMs: parseNumber(item.duration),
      rawError: failures || undefined,
    }));
  }
  return { run: context, attempts, environment: context.environment };
}

export async function parsePlaywrightJson(stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const context = await createRunContext(metadata);
  const attempts: NormalizedAttempt[] = [];
  async function visitSuite(value: unknown, parents: string[] = []): Promise<void> {
    const suite = asRecord(value);
    const title = String(suite.title ?? '');
    const path = title ? [...parents, title] : parents;
    for (const specValue of asArray(suite.specs)) {
      const spec = asRecord(specValue);
      for (const testValue of asArray(spec.tests)) {
        const test = asRecord(testValue);
        for (const resultValue of asArray(test.results)) {
          const result = asRecord(resultValue);
          const error = asRecord(result.error);
          attempts.push(await makeAttempt(context, {
            filePath: String(spec.file ?? (test.location && asRecord(test.location).file) ?? metadata.source_file_path ?? '<unknown>'),
            suiteName: path.join('/'),
            testName: String(spec.title ?? test.title ?? '<unnamed>'),
            status: statusOf(result.status ?? test.status),
            durationMs: parseNumber(result.duration),
            rawError: String(error.message ?? error.stack ?? ''),
            attemptNumber: attempts.filter((item) => item.testName === String(spec.title ?? test.title ?? '<unnamed>')).length + 1,
          }));
        }
      }
    }
    for (const child of asArray(suite.suites)) await visitSuite(child, path);
  }
  for (const suite of await parseJsonStream(stream, '$.suites.*')) await visitSuite(suite);
  return { run: context, attempts, environment: context.environment };
}

export async function parsePytestJson(stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const context = await createRunContext(metadata);
  const attempts: NormalizedAttempt[] = [];
  for (const value of await parseJsonStream(stream, '$.tests.*')) {
    const item = asRecord(value);
    const call = asRecord(item.call);
    const outcome = String(call.outcome ?? item.outcome);
    const longrepr = typeof call.longrepr === 'string' ? call.longrepr : JSON.stringify(call.longrepr ?? '');
    attempts.push(await makeAttempt(context, {
      filePath: String(item.file ?? metadata.source_file_path ?? '<unknown>'),
      suiteName: String(item.nodeid ?? '').split('::').slice(0, -1).join('/'),
      testName: String(item.name ?? String(item.nodeid ?? '<unnamed>').split('::').pop()),
      status: statusOf(outcome),
      durationMs: parseNumber(call.duration ?? item.duration),
      rawError: outcome.toLowerCase() === 'passed' ? undefined : longrepr,
    }));
  }
  return { run: context, attempts, environment: context.environment };
}
