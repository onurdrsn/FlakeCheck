export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface RunIdentityInput {
  repository: string;
  branch: string;
  commitSha: string;
  ciWorkflowName: string;
  runAttemptNumber: number;
  sourceFilePath?: string | undefined;
  fileSha256?: string | undefined;
}

export async function createRunId(input: RunIdentityInput): Promise<string> {
  if (input.repository && input.branch && input.commitSha && input.ciWorkflowName) {
    return sha256(`${input.repository}:${input.branch}:${input.commitSha}:${input.ciWorkflowName}:${input.runAttemptNumber}`);
  }
  if (input.sourceFilePath && input.fileSha256) {
    return sha256(`${input.sourceFilePath}:${input.fileSha256}`);
  }
  throw new Error('Run identity requires primary fields or source_file_path and file_sha256 fallback fields');
}

export interface TestIdentityInput {
  repository: string;
  normalizedFilepath: string;
  suiteHierarchy: string[];
  testName: string;
  argumentTokens?: string[] | undefined;
}

export async function createTestId(input: TestIdentityInput): Promise<string> {
  const filepath = input.normalizedFilepath.replaceAll('\\', '/');
  const parameterSuffix = input.argumentTokens?.length ? `::${input.argumentTokens.join('::')}` : '';
  return sha256(`${input.repository}:${filepath}::${input.suiteHierarchy.join('/')}::${input.testName}${parameterSuffix}`);
}

export async function createAttemptId(runId: string, testId: string, attemptNumber: number): Promise<string> {
  return sha256(`${runId}:${testId}:${attemptNumber}`);
}

export const ENVIRONMENT_DIMENSIONS = [
  'os',
  'os_version',
  'architecture',
  'runtime_name',
  'runtime_version',
  'framework_name',
  'framework_version',
  'container_image_digest',
  'dependency_lockfile_sha256',
] as const;

export type EnvironmentDimension = typeof ENVIRONMENT_DIMENSIONS[number];
export type EnvironmentInput = Partial<Record<EnvironmentDimension, string | undefined>>;

export interface EnvironmentFingerprintResult {
  fingerprint: string;
  serialized: string;
  normalized: Record<EnvironmentDimension, string>;
}

export async function createEnvironmentFingerprint(input: EnvironmentInput): Promise<EnvironmentFingerprintResult> {
  const normalized = Object.fromEntries(
    ENVIRONMENT_DIMENSIONS.map((key) => [
      key,
      input[key]?.trim().toLowerCase()
        || (key === 'container_image_digest' || key === 'dependency_lockfile_sha256' ? '<none>' : '<unknown>'),
    ]),
  ) as Record<EnvironmentDimension, string>;
  const serialized = ENVIRONMENT_DIMENSIONS.map((key) => `${key}=${normalized[key]}`).join('\n');
  return { fingerprint: await sha256(serialized), serialized, normalized };
}
