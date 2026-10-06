import { createRunContext, makeAttempt, parseNumber, readChunked } from './common.js';
import type { NormalizedAttempt, ParsedIngestion, ParserMetadata } from './types.js';

export async function parseGoTestJson(stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const context = await createRunContext(metadata);
  const decoder = new TextDecoder();
  let pending = '';
  const attempts: NormalizedAttempt[] = [];
  const testAttempts = new Map<string, number>();
  async function parseLine(line: string): Promise<void> {
    if (!line.trim()) return;
    const item = JSON.parse(line) as Record<string, unknown>;
    if (!item.Test || !['pass', 'fail', 'skip'].includes(String(item.Action))) return;
    const name = String(item.Test);
    const attemptNumber = (testAttempts.get(name) ?? 0) + 1;
    testAttempts.set(name, attemptNumber);
    attempts.push(await makeAttempt(context, {
      filePath: metadata.source_file_path ?? '<go-test>',
      suiteName: String(item.Package ?? ''),
      testName: name,
      status: String(item.Action) === 'pass' ? 'PASSED' : String(item.Action) === 'skip' ? 'SKIPPED' : 'FAILED',
      durationMs: parseNumber(typeof item.Elapsed === 'number' ? item.Elapsed * 1000 : item.Elapsed),
      rawError: String(item.Action) === 'fail' ? String(item.Output ?? '') : undefined,
      attemptNumber,
    }));
  }
  await readChunked(stream, async (chunk) => {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) await parseLine(line);
  });
  pending += decoder.decode();
  await parseLine(pending);
  return { run: context, attempts, environment: context.environment };
}
