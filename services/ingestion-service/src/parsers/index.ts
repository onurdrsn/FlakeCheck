import type { ParsedIngestion, ParserMetadata } from './types.js';
import { sha256Bytes } from '@flakecheck/shared-kernel';
import { parseJunitXml } from './junit.js';
import { parseJestJson, parsePlaywrightJson, parsePytestJson } from './json.js';
import { parseGoTestJson } from './go.js';

export type SupportedFormat =
  | 'junit' | 'junit-xml' | 'jest' | 'jest-json' | 'playwright' | 'playwright-json'
  | 'pytest' | 'pytest-json' | 'go' | 'go-test' | 'go-test-json';

export async function parseReport(format: string, stream: ReadableStream<Uint8Array>, metadata: ParserMetadata): Promise<ParsedIngestion> {
  const normalizedFormat = format.toLowerCase();
  const needsFallback = !(metadata.branch && metadata.commit_sha && metadata.ci_workflow_name);
  let parserMetadata = metadata;
  let parserStream = stream;
  if (needsFallback && !(metadata.source_file_path && metadata.file_sha256)) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLength += value.byteLength;
        }
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    parserMetadata = {
      ...metadata,
      source_file_path: metadata.source_file_path ?? `report.${normalizedFormat}`,
      file_sha256: await sha256Bytes(bytes),
    };
    parserStream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
  switch (normalizedFormat as SupportedFormat) {
    case 'junit':
    case 'junit-xml':
      return parseJunitXml(parserStream, parserMetadata);
    case 'jest':
    case 'jest-json':
      return parseJestJson(parserStream, parserMetadata);
    case 'playwright':
    case 'playwright-json':
      return parsePlaywrightJson(parserStream, parserMetadata);
    case 'pytest':
    case 'pytest-json':
      return parsePytestJson(parserStream, parserMetadata);
    case 'go':
    case 'go-test':
    case 'go-test-json':
      return parseGoTestJson(parserStream, parserMetadata);
    default:
      throw new Error(`Unsupported ingestion format: ${format}`);
  }
}

export type { NormalizedAttempt, ParsedIngestion, ParserMetadata } from './types.js';
