import { sha256 } from './hashing.js';
import { normalizeFailureText } from './sanitization.js';

export interface FailureSignatureInput {
  errorType: string;
  rawError: string;
}

export function normalizeFailure(input: string): string {
  return normalizeFailureText(input);
}

export async function createFailureSignature(input: FailureSignatureInput): Promise<string> {
  const lines = normalizeFailureText(input.rawError).split(/\r?\n/);
  const firstLine = lines[0] ?? '';
  const stackFrames = lines.filter((line) => /^\s*at\s+/.test(line)).slice(0, 3);
  return sha256(`${input.errorType}::${firstLine}::${stackFrames.join('\n')}`);
}
