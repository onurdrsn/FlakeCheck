import type { AttemptSnapshot, RunSnapshot } from './model.js';

export type RootCauseCategory =
  | 'timing_race'
  | 'order_dependency'
  | 'network_external'
  | 'shared_state'
  | 'resource_concurrency'
  | 'environment_diff'
  | 'unknown';

export interface RootCauseResult {
  rootCause: RootCauseCategory;
  ruleId: string;
  confidence: number;
  matchedEvidence: string[];
  remediation: string;
}

interface RootCauseRule {
  id: string;
  category: Exclude<RootCauseCategory, 'unknown' | 'environment_diff'>;
  confidence: number;
  patterns: RegExp[];
  remediation: string;
}

const ROOT_CAUSE_RULES: readonly RootCauseRule[] = [
  {
    id: 'RC_NETWORK_EXTERNAL',
    category: 'network_external',
    confidence: 92,
    patterns: [
      /\bECONNREFUSED\b/i,
      /\bECONNRESET\b/i,
      /\bETIMEDOUT\b/i,
      /\bENOTFOUND\b/i,
      /\bEAI_AGAIN\b/i,
      /socket hang up/i,
      /fetch failed/i,
      /\b(502|503|504)\s*(bad gateway|service unavailable|gateway timeout)?\b/i,
      /\b429\b.*too many requests/i,
      /rate\s*limit\s*exceeded/i,
      /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED/i,
    ],
    remediation: 'Mock external HTTP dependencies with deterministic fixtures (MSW, Nock, WireMock) or run an isolated local test container instead of hitting live third-party endpoints.',
  },
  {
    id: 'RC_RESOURCE_CONCURRENCY',
    category: 'resource_concurrency',
    confidence: 90,
    patterns: [
      /\bENOMEM\b/i,
      /heap out of memory|JavaScript heap out of memory/i,
      /\bSIGKILL\b|exit\s*(code\s*)?137/i,
      /\bEMFILE\b|too many open files/i,
      /disk\s*full|no\s*space\s*left\s*on\s*device|\bENOSPC\b/i,
      /worker\s*(pool|thread)?\s*(exhausted|terminated|crashed)/i,
      /connection\s*pool\s*(exhausted|timeout)/i,
    ],
    remediation: 'Reduce test runner concurrency (e.g. --maxWorkers=2 or --workers=2), close open file handles/DB pools in afterEach/afterAll hooks, and increase CI runner memory limits.',
  },
  {
    id: 'RC_SHARED_STATE',
    category: 'shared_state',
    confidence: 88,
    patterns: [
      /duplicate key value violates unique constraint/i,
      /UNIQUE constraint failed/i,
      /deadlock detected/i,
      /SQLITE_BUSY|database is locked/i,
      /\bEADDRINUSE\b|address already in use/i,
      /file\s*(is\s*)?locked|\bEBUSY\b/i,
      /already exists.*fixture|dirty\s*state/i,
    ],
    remediation: 'Isolate per-test state: bind ephemeral ports (port 0), wrap DB tests in rolled-back transactions or unique schemas per worker, and use unique temporary directories.',
  },
  {
    id: 'RC_TIMING_RACE',
    category: 'timing_race',
    confidence: 86,
    patterns: [
      /exceeded timeout of \d+|timed out after \d+|Timeout \d+ms exceeded/i,
      /async callback was not invoked within/i,
      /element is detached from the DOM|stale element reference/i,
      /waiting for (selector|locator|element|navigation|response)/i,
      /setTimeout|setInterval|race condition/i,
      /act\(\.\.\.\) warning|cannot log after tests are done/i,
      /context\.deadline exceeded|context canceled/i,
    ],
    remediation: 'Replace fixed sleeps/setTimeout calls with deterministic event waits or fake timers (vi.useFakeTimers / jest.useFakeTimers), and await all pending async assertions before test teardown.',
  },
  {
    id: 'RC_ORDER_DEPENDENCY',
    category: 'order_dependency',
    confidence: 84,
    patterns: [
      /order[- ]dependent|depends on previous test/i,
      /beforeAll.*state|afterAll.*cleanup/i,
      /mock.*not reset|spy.*already called|unexpected call count/i,
      /global\s*(state|variable|singleton)\s*(mutated|polluted)/i,
      /expected .* to be 0.*received [1-9]/i,
    ],
    remediation: 'Reset mocks, spies, singletons, and module state in beforeEach/afterEach hooks, and verify isolation by running the suite with randomized test order.',
  },
];

function extractSnippet(text: string, match: RegExpMatchArray): string {
  const idx = match.index ?? 0;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + match[0].length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function classifyRootCause(
  attempts: readonly AttemptSnapshot[],
  runs: readonly RunSnapshot[],
): RootCauseResult {
  // 1. Check environment differential on the same commit first
  const byRun = new Map<string, AttemptSnapshot[]>();
  for (const attempt of attempts) {
    byRun.set(attempt.runId, [...(byRun.get(attempt.runId) ?? []), attempt]);
  }
  const byCommit = new Map<string, RunSnapshot[]>();
  for (const run of runs) {
    byCommit.set(run.commitSha, [...(byCommit.get(run.commitSha) ?? []), run]);
  }
  for (const [commitSha, commitRuns] of byCommit.entries()) {
    const byEnv = new Map<string, AttemptSnapshot[]>();
    for (const run of commitRuns) {
      byEnv.set(run.envFingerprint, [...(byEnv.get(run.envFingerprint) ?? []), ...(byRun.get(run.id) ?? [])]);
    }
    const envEntries = [...byEnv.entries()];
    const passingEnv = envEntries.find(([, grp]) => grp.length > 0 && grp.every((a) => a.status === 'PASSED'));
    const failingEnv = envEntries.find(([, grp]) => grp.length > 0 && grp.every((a) => a.status === 'FAILED'));
    if (passingEnv && failingEnv) {
      return {
        rootCause: 'environment_diff',
        ruleId: 'RC_ENV_DIFF',
        confidence: 94,
        matchedEvidence: [
          `Commit ${commitSha.slice(0, 7)} passed on env "${passingEnv[0]}" and failed on env "${failingEnv[0]}".`,
        ],
        remediation: 'Pin runtime versions, timezone (TZ=UTC), locale (LC_ALL=C.UTF-8), and OS-specific path handling across local and CI runner images.',
      };
    }
  }

  // 2. Evaluate strict log / stack trace rules on failed attempts
  const failedAttempts = attempts.filter((a) => a.status === 'FAILED');
  for (const rule of ROOT_CAUSE_RULES) {
    const evidence: string[] = [];
    for (const attempt of failedAttempts) {
      const combined = `${attempt.failureSignature ?? ''}\n${attempt.rawError ?? ''}`.trim();
      if (!combined) continue;
      for (const pattern of rule.patterns) {
        const match = combined.match(pattern);
        if (match) {
          const snippet = extractSnippet(combined, match);
          if (!evidence.includes(snippet)) evidence.push(snippet);
          break;
        }
      }
      if (evidence.length >= 3) break;
    }
    if (evidence.length > 0) {
      return {
        rootCause: rule.category,
        ruleId: rule.id,
        confidence: rule.confidence,
        matchedEvidence: evidence,
        remediation: rule.remediation,
      };
    }
  }

  // 3. Explicit unknown fallback
  return {
    rootCause: 'unknown',
    ruleId: 'RC_UNKNOWN',
    confidence: 0,
    matchedEvidence: [],
    remediation: 'Capture verbose failure logs, stack traces, and rerun diagnostics to isolate whether this failure is caused by timing, shared state, or external dependencies.',
  };
}
