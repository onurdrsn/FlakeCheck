import { SAXParser } from 'sax-ts';
import { createRunContext, makeAttempt, parseNumber, readChunked } from './common.js';
import type { NormalizedAttempt, ParsedIngestion, ParserMetadata } from './types.js';

export async function parseJunitXml(stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const context = await createRunContext(metadata);
  const parser = new SAXParser(true, { lowercase: true });
  const attempts: NormalizedAttempt[] = [];
  let current: { name: string; suite: string; file: string; duration: number; status: 'PASSED' | 'FAILED' | 'SKIPPED'; error: string } | undefined;
  let text = '';
  parser.onopentag = (node: { name: string; attributes: Record<string, string> }) => {
    const name = node.name.toLowerCase();
    if (name === 'testcase') {
      const attributes = node.attributes;
      current = {
        name: String(attributes.name ?? '<unnamed>'),
        suite: String(attributes.classname ?? ''),
        file: String(attributes.file ?? metadata.source_file_path ?? '<junit>'),
        duration: parseNumber(Number(attributes.time ?? 0) * 1000),
        status: 'PASSED',
        error: '',
      };
    } else if (current && (name === 'failure' || name === 'error' || name === 'skipped')) {
      if (name === 'skipped') current.status = 'SKIPPED';
      else current.status = 'FAILED';
      text = '';
    }
  };
  parser.ontext = (value: string) => { text += value; };
  parser.oncdata = (value: string) => { text += value; };
  parser.onclosetag = (name: string) => {
    const normalizedName = name.toLowerCase();
    if (current && (normalizedName === 'failure' || normalizedName === 'error')) current.error += text;
    if (normalizedName === 'testcase' && current) {
      const value = current;
      current = undefined;
      attempts.push({
        id: '',
        runId: context.id,
        testId: '',
        repo: context.repo,
        filePath: value.file,
        suiteName: value.suite,
        testName: value.name,
        attemptNumber: 0,
        status: value.status,
        durationMs: value.duration,
        failureSignature: null,
        rawError: value.error || null,
      });
    }
    text = '';
  };
  let parserError: Error | undefined;
  parser.onerror = (error: Error) => { parserError = error; };
  const decoder = new TextDecoder();
  await readChunked(stream, (chunk) => {
    parser.write(decoder.decode(chunk, { stream: true }));
  });
  parser.write(decoder.decode());
  parser.close();
  if (parserError) throw parserError;
  const normalized = [];
  for (const attempt of attempts) {
    normalized.push(await makeAttempt(context, {
      filePath: attempt.filePath,
      suiteName: attempt.suiteName,
      testName: attempt.testName,
      status: attempt.status,
      durationMs: attempt.durationMs,
      ...(attempt.rawError ? { rawError: attempt.rawError } : {}),
    }));
  }
  return { run: context, attempts: normalized, environment: context.environment };
}
