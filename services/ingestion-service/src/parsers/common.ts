import {
  createAttemptId,
  createEnvironmentFingerprint,
  createRunId,
  createTestId,
  createFailureSignature,
  sanitizeSecrets,
} from '@flakecheck/shared-kernel';
import type { EnvironmentInput } from '@flakecheck/shared-kernel';
import type { NormalizedAttempt, ParsedIngestion, ParserMetadata, AttemptStatus } from './types.js';

export async function readChunked(stream: ReadableStream<Uint8Array>, onChunk: (chunk: Uint8Array) => void | Promise<void>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) await onChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function metadataEnvironment(metadata: ParserMetadata): EnvironmentInput {
  const values = metadata.env?.split(',').map((pair) => pair.split('=')) ?? [];
  return Object.fromEntries(values.filter(([key, value]) => key && value)) as EnvironmentInput;
}

export async function createRunContext(metadata: ParserMetadata): Promise<ParsedIngestion['run'] & { environment: EnvironmentInput }> {
  const environment = metadataEnvironment(metadata);
  const { fingerprint } = await createEnvironmentFingerprint(environment);
  const branch = metadata.branch || 'local';
  const commitSha = metadata.commit_sha || metadata.file_sha256 || 'local-report';
  const ciWorkflow = metadata.ci_workflow_name || 'local-ingest';
  const id = await createRunId({
    repository: metadata.repo,
    branch: metadata.branch ?? '',
    commitSha: metadata.commit_sha ?? '',
    ciWorkflowName: metadata.ci_workflow_name ?? '',
    runAttemptNumber: Number(metadata.run_attempt_number || 1),
    sourceFilePath: metadata.source_file_path,
    fileSha256: metadata.file_sha256,
  });
  return {
    id,
    repo: metadata.repo,
    branch,
    commitSha,
    ciWorkflow,
    envFingerprint: fingerprint,
    setupDurationMs: parseNumber(metadata.setup_duration_ms),
    durationMs: parseNumber(metadata.duration_ms),
    environment,
  };
}

export async function makeAttempt(
  context: ParsedIngestion['run'],
  values: {
    filePath: string;
    suiteName: string;
    testName: string;
    status: AttemptStatus;
    durationMs?: number;
    rawError?: string | undefined;
    attemptNumber?: number;
    argumentTokens?: string[] | undefined;
  },
): Promise<NormalizedAttempt> {
  const testId = await createTestId({
    repository: context.repo,
    normalizedFilepath: values.filePath,
    suiteHierarchy: values.suiteName ? [values.suiteName] : [],
    testName: values.testName,
    argumentTokens: values.argumentTokens,
  });
  const attemptNumber = values.attemptNumber ?? 1;
  const id = await createAttemptId(context.id, testId, attemptNumber);
  const rawError = values.rawError ? sanitizeSecrets(values.rawError) : null;
  return {
    id,
    runId: context.id,
    testId,
    repo: context.repo,
    filePath: values.filePath.replaceAll('\\', '/'),
    suiteName: values.suiteName,
    testName: values.testName,
    attemptNumber,
    status: values.status,
    durationMs: values.durationMs ?? 0,
    failureSignature: rawError
      ? await createFailureSignature({ errorType: 'TestFailure', rawError })
      : null,
    rawError,
  };
}

export function parseNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}
