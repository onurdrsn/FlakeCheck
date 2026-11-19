export interface SeoGuide {
  slug: string;
  section: 'guides' | 'compare';
  title: string; // < 60 chars
  description: string; // < 155 chars
  h1: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  readMinutes: number;
  keywords: string[];
  sections: Array<{ heading: string; paragraphs: string[]; code?: { lang: string; snippet: string } }>;
  faqs?: Array<{ q: string; a: string }>;
}

export const SEO_GUIDES: readonly SeoGuide[] = [
  {
    slug: 'what-is-a-flaky-test',
    section: 'guides',
    title: 'What Is a Flaky Test? Causes & Fix Guide | FlakeCheck',
    description: 'Learn what a flaky test is, why flaky tests break CI velocity, how to measure test flakiness, and how FlakeCheck quarantines unstable tests.',
    h1: 'What Is a Flaky Test? Causes, Impact, and How to Eliminate Test Flakiness',
    category: 'Fundamentals',
    publishedAt: '2026-10-01',
    updatedAt: '2026-11-19',
    readMinutes: 7,
    keywords: ['flaky test', 'flaky tests', 'test flakiness', 'flaky test detection', 'FlakeCheck', 'Flake Check'],
    sections: [
      {
        heading: 'Definition of a Flaky Test',
        paragraphs: [
          'A flaky test is an automated test that both passes and fails across repeated executions against the exact same source code and commit SHA. Because no application code changed between the failing run and the passing rerun, a flaky test breaks the fundamental contract of continuous integration: a red build should always mean a real defect.',
          'In modern engineering organizations, test flakiness is rarely caused by a single bad assertion. It emerges from non-determinism in timing, asynchronous event loops, shared database fixtures, network calls to external sandboxes, CPU contention on CI runners, or subtle OS and timezone differences between developer laptops and Linux containers.',
          'Teams often search for a reliable flaky test detector — whether they call it FlakeCheck, Flake Check, or flake-check — once engineers begin habitually clicking "Re-run failed jobs" in GitHub Actions or GitLab CI. The moment developers stop trusting red builds, genuine regressions slip into production alongside retries.',
        ],
      },
      {
        heading: 'The Hidden Engineering Cost of Flaky Tests in CI',
        paragraphs: [
          'Every unnecessary CI rerun consumes runner minutes, blocks merge queues, and forces context switches. Suppose a 15-minute CI pipeline has just a 5% per-run flake probability across 40 pull requests per day. That translates to dozens of broken builds every week, hours of wasted compute, and lost developer focus.',
          'Measuring this cost objectively is the fastest way to prioritize reliability work. FlakeCheck calculates exact CI runner time wasted on flaky reruns and converts it into a transparent monthly USD figure per repository and team.',
        ],
        code: {
          lang: 'bash',
          snippet: `# Ingest JUnit, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, or Go test reports
npx @onurdrsn/flakecheck ingest ./junit.xml --format junit
npx @onurdrsn/flakecheck report --format markdown`,
        },
      },
      {
        heading: 'Six Primary Root Causes of Test Flakiness',
        paragraphs: [
          '1. Timing and race conditions: hard-coded sleeps, unawaited promises, animations, or DOM elements detaching before Playwright or Cypress interacts with them.',
          '2. Test order dependency: tests that pass only when executed after another test populates global state, mocks, or module singletons, and fail when run in isolation or randomized order.',
          '3. Network and external services: tests hitting live third-party APIs or shared staging endpoints that occasionally return HTTP 429, 502, 503, ECONNRESET, or DNS timeouts.',
          '4. Shared state collisions: parallel workers fighting over hardcoded TCP ports (EADDRINUSE), shared database rows (unique constraint violations), or temp files.',
          '5. Resource and concurrency exhaustion: CI runners hitting OOM (exit code 137 / SIGKILL), file descriptor limits (EMFILE), or connection pool exhaustion under high worker counts.',
          '6. Environment differences: tests passing on macOS with local timezones while failing on UTC Linux CI containers due to locale formatting, path separators, or clock skew.',
        ],
      },
      {
        heading: 'How Statistical Flaky Test Detection Works',
        paragraphs: [
          'Simple retry counters produce noisy false positives when a real regression is retried or when a single infrastructure outage hits a runner. Production-grade flaky test detection combines two signals: same-commit rerun flips (definitive proof of non-determinism) and historical cross-run flip rates smoothed with a Wilson score confidence interval and a minimum sample size guard.',
          'Once a test crosses your configured flakiness score threshold (for example 60/100 across at least 5 samples), FlakeCheck automatically classifies its root cause, quarantines it in non-blocking mode so PRs keep shipping, and opens a tracked issue in GitHub Issues, Jira, or Linear with concrete remediation steps.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How many flaky tests is too many for a CI suite?',
        a: 'If more than 1% of CI builds fail due to non-deterministic tests, developer trust erodes rapidly. Tracking health score and quarantining tests with a flakiness score above 60 keeps merge queues green while owners fix root causes.',
      },
      {
        q: 'Should we delete flaky tests or quarantine them?',
        a: 'Never silently delete coverage. Quarantine flaky tests in non-blocking mode with an assigned owner and an auto-graduation policy (such as 10 consecutive clean passes) so they return to blocking CI once fixed.',
      },
    ],
  },
  {
    slug: 'how-to-detect-flaky-tests',
    section: 'guides',
    title: 'How to Detect Flaky Tests in CI Pipelines | FlakeCheck',
    description: 'Step-by-step guide to flaky test detection using rerun tracking, flip-rate statistics, Wilson confidence intervals, JUnit XML, and CTRF.',
    h1: 'How to Detect Flaky Tests Automatically in CI/CD Pipelines',
    category: 'Detection',
    publishedAt: '2026-10-05',
    updatedAt: '2026-11-19',
    readMinutes: 8,
    keywords: ['detect flaky tests', 'flaky test detection', 'flaky test detector', 'CTRF', 'JUnit XML', 'FlakeCheck'],
    sections: [
      {
        heading: 'Why Manual Flake Hunting Fails at Scale',
        paragraphs: [
          'Searching CI logs by hand only catches the loudest failures. Subtle flaky tests that fail 3% of the time slip past individual developers because each engineer sees the failure once, hits retry, and moves on. Across a 30-engineer team, a 3% flake across 20 tests means nearly half of all pull requests experience a spurious failure.',
          'Automated flaky test detection requires structured attempt-level telemetry across every CI execution, normalized across frameworks like Jest, Vitest, Playwright, Pytest, Mocha, Go test, JUnit XML, and CTRF.',
        ],
      },
      {
        heading: 'Combining Rerun Signals and Historical Flip Rates',
        paragraphs: [
          'The gold standard for proving a test is flaky is observing both a FAILED and a PASSED attempt on the exact same commit SHA and environment fingerprint. When your runner retries failed tests automatically (for example Playwright retries: 2 or pytest-rerunfailures), FlakeCheck captures every attempt and flags proven flakes with 100% confidence.',
          'For suites without inline retries, historical flip-rate analysis tracks pass-to-fail and fail-to-pass transitions across consecutive runs where the test file did not change. Applying a Wilson score 95% confidence interval and a minimum sample size prevents newly added tests with one transient failure from triggering false alarms.',
        ],
        code: {
          lang: 'yaml',
          snippet: `# .github/workflows/ci.yml
- name: Run tests with retries and JUnit output
  run: pnpm test --reporter=junit --outputFile=junit.xml
  continue-on-error: true

- name: Detect flaky tests with FlakeCheck
  uses: ./ci-templates/github-action
  with:
    gateway-url: \${{ secrets.FLAKECHECK_URL }}
    token: \${{ secrets.FLAKECHECK_TOKEN }}
    format: junit
    files: junit.xml`,
        },
      },
      {
        heading: 'Standardizing on JUnit XML and CTRF',
        paragraphs: [
          'Polyglot repositories mix TypeScript, Python, Go, and Java test runners. Instead of maintaining fragile custom scripts per language, FlakeCheck natively parses JUnit XML and the Common Test Report Format (CTRF) alongside native JSON outputs for Jest, Vitest, Playwright, Pytest, Mocha, and Go test.',
          'CTRF is especially valuable because it explicitly records retry counts, flaky flags, file paths, and error traces in a single portable JSON schema.',
        ],
      },
      {
        heading: 'Verifying Your Setup with the CLI Doctor',
        paragraphs: [
          'Before rolling out flaky test detection across all repositories, run flakecheck doctor --json locally or in a CI job to verify gateway connectivity, Neon PostgreSQL readiness, repository token scope, and Git metadata resolution.',
        ],
        code: {
          lang: 'bash',
          snippet: `flakecheck init --gateway https://flakecheck.onurd.com.tr --repo acme/app --token "$FLAKECHECK_TOKEN"
flakecheck doctor --json`,
        },
      },
    ],
  },
  {
    slug: 'how-to-fix-flaky-tests',
    section: 'guides',
    title: 'How to Fix Flaky Tests: Causes & Solutions | FlakeCheck',
    description: 'Actionable engineering playbook on how to fix flaky tests across timing races, shared state, network calls, concurrency, and test order.',
    h1: 'How to Fix Flaky Tests: Root Causes, Code Patterns, and Prevention',
    category: 'Remediation',
    publishedAt: '2026-10-10',
    updatedAt: '2026-11-19',
    readMinutes: 9,
    keywords: ['how to fix flaky tests', 'fix flaky tests', 'quarantine flaky tests', 'test flakiness', 'FlakeCheck'],
    sections: [
      {
        heading: '1. Eliminate Timing and Race Conditions',
        paragraphs: [
          'Hard-coded sleep statements (sleep(500), setTimeout) are the single largest source of flaky tests. Under heavy CI load, a 500ms wait finishes before an async request or DOM transition completes. Replace arbitrary delays with deterministic condition polling, fake timers, or event-driven assertions.',
        ],
        code: {
          lang: 'typescript',
          snippet: `// Bad: race-prone sleep
await new Promise((r) => setTimeout(r, 300));
expect(statusText).toBe('Saved');

// Good: deterministic wait / fake timers
await expect.poll(() => getStatusText(), { timeout: 5000 }).toBe('Saved');`,
        },
      },
      {
        heading: '2. Isolate Shared State and Parallel Workers',
        paragraphs: [
          'Tests that bind fixed ports (like 3000 or 8080), write to a shared temp path, or insert hardcoded emails into a shared PostgreSQL database will randomly collide when test runners execute files in parallel. Always bind port 0 for ephemeral test servers, use unique UUIDs or rolled-back transactions per test, and create isolated temporary directories.',
        ],
      },
      {
        heading: '3. Stub External Networks Deterministically',
        paragraphs: [
          'Unit and integration tests must never depend on live external APIs. Use Mock Service Worker (MSW), Nock, WireMock, or local test containers so network latency, rate limits, and third-party outages cannot poison your CI signal.',
        ],
      },
      {
        heading: '4. Quarantine While You Fix (Without Blocking Deploys)',
        paragraphs: [
          'When a critical release is blocked by a known flaky test, teams face an ugly choice: disable the entire test suite or repeatedly rerun CI. Automated quarantine solves this cleanly. FlakeCheck moves high-score flakes into non-blocking quarantine mode, tracks the owner and reason in an audit log, opens a Jira/Linear/GitHub issue, and automatically graduates the test back to blocking CI once it passes 10 consecutive runs.',
        ],
      },
    ],
  },
  {
    slug: 'jest-flaky-tests',
    section: 'guides',
    title: 'Jest Flaky Tests: Detection & Fixes | FlakeCheck',
    description: 'Detect and fix Jest flaky tests caused by open handles, fake timers, mock leaks, and worker contention. Integrate Jest JSON with FlakeCheck.',
    h1: 'How to Detect and Fix Jest Flaky Tests in CI',
    category: 'Framework Guides',
    publishedAt: '2026-10-12',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['Jest flaky tests', 'flaky test', 'detect flaky tests', 'FlakeCheck'],
    sections: [
      {
        heading: 'Common Causes of Jest Flaky Tests',
        paragraphs: [
          'Jest runs test files across parallel child workers. The most common sources of Jest flakiness are uncleaned timers (leading to "Cannot log after tests are done"), shared module mocks not cleared in afterEach, open HTTP/database handles, and CPU starvation when --maxWorkers is left unconstrained on 2-vCPU CI runners.',
        ],
        code: {
          lang: 'bash',
          snippet: `# Run Jest with JSON output and open-handle detection
npx jest --json --outputFile=jest-results.json --detectOpenHandles --maxWorkers=2
npx @onurdrsn/flakecheck ingest jest-results.json --format jest`,
        },
      },
      {
        heading: 'Enforcing Clean Hooks and Fake Timers',
        paragraphs: [
          'Enable clearMocks: true and restoreMocks: true in jest.config.ts, and call jest.useRealTimers() in afterEach whenever a suite uses fake timers. Combine this with FlakeCheck skip-list generation to quarantine chronic offenders while keeping pull requests green.',
        ],
      },
    ],
  },
  {
    slug: 'playwright-flaky-tests',
    section: 'guides',
    title: 'Playwright Flaky Tests: Locators & CI | FlakeCheck',
    description: 'Eliminate Playwright flaky tests with web-first assertions, network idling fixes, trace analysis, and automatic FlakeCheck quarantine.',
    h1: 'Playwright Flaky Tests: Root Causes, Retries, and Quarantine',
    category: 'Framework Guides',
    publishedAt: '2026-10-14',
    updatedAt: '2026-11-19',
    readMinutes: 7,
    keywords: ['Playwright flaky tests', 'flaky tests CI', 'quarantine flaky tests', 'FlakeCheck'],
    sections: [
      {
        heading: 'Why End-to-End Playwright Suites Flake',
        paragraphs: [
          'Playwright includes auto-waiting, yet E2E tests still flake when scripts use manual element handles instead of web-first locators, race against background API hydration, share browser storage state across workers, or hit throttled CI runner CPUs.',
        ],
        code: {
          lang: 'typescript',
          snippet: `// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  reporter: [['json', { outputFile: 'playwright-results.json' }]],
  use: { trace: 'on-first-retry' },
});`,
        },
      },
      {
        heading: 'Streaming Playwright JSON to FlakeCheck',
        paragraphs: [
          'With retries enabled on CI, Playwright records every failed attempt and passing retry inside playwright-results.json. Streaming that file to FlakeCheck immediately surfaces proven flakes with 100% confidence, extracts exact selector timeout evidence, and computes wasted runner minutes.',
        ],
        code: {
          lang: 'bash',
          snippet: `npx playwright test
npx @onurdrsn/flakecheck ingest playwright-results.json --format playwright`,
        },
      },
    ],
  },
  {
    slug: 'pytest-flaky-tests',
    section: 'guides',
    title: 'Pytest Flaky Tests: Fixtures & Reruns | FlakeCheck',
    description: 'Track and fix Pytest flaky tests with pytest-rerunfailures, JUnit XML or pytest-json-report, fixture isolation, and FlakeCheck analytics.',
    h1: 'Pytest Flaky Tests: Isolating Fixtures, Async Loops, and Reruns',
    category: 'Framework Guides',
    publishedAt: '2026-10-16',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['Pytest flaky tests', 'flaky test detection', 'how to fix flaky tests', 'FlakeCheck'],
    sections: [
      {
        heading: 'Tracking Pytest Reruns in CI',
        paragraphs: [
          'Python suites frequently suffer from module-scoped fixture bleed, shared SQLite/Postgres state, and unclosed asyncio event loops. Pair pytest-rerunfailures with JUnit XML or pytest-json-report so FlakeCheck captures every retry attempt.',
        ],
        code: {
          lang: 'bash',
          snippet: `pytest --reruns 2 --junitxml=pytest-junit.xml
npx @onurdrsn/flakecheck ingest pytest-junit.xml --format junit`,
        },
      },
      {
        heading: 'Detecting Order-Dependent Pytest Suites',
        paragraphs: [
          'Install pytest-randomly in CI to shuffle execution order on every run. When a test fails only in specific orderings, FlakeCheck flags its flip rate and surfaces order_dependency remediation guidance.',
        ],
      },
    ],
  },
  {
    slug: 'go-flaky-tests',
    section: 'guides',
    title: 'Go Flaky Tests: Race Detector & CI | FlakeCheck',
    description: 'Detect Go flaky tests with go test -json, -race, and -count. Stream Go test JSON directly to FlakeCheck for flakiness scoring.',
    h1: 'Go Flaky Tests: Concurrency Races, Goroutine Leaks, and Detection',
    category: 'Framework Guides',
    publishedAt: '2026-10-18',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['Go flaky tests', 'flaky test detector', 'test flakiness', 'FlakeCheck'],
    sections: [
      {
        heading: 'Native Go Test JSON Streaming',
        paragraphs: [
          'Go tests frequently flake due to goroutine scheduling races, map iteration order assumptions, time.Sleep synchronization, or port collisions. FlakeCheck natively parses streaming go test -json output.',
        ],
        code: {
          lang: 'bash',
          snippet: `go test -race -json ./... > go-test.json
npx @onurdrsn/flakecheck ingest go-test.json --format go`,
        },
      },
      {
        heading: 'Stress-Testing Suspected Flakes',
        paragraphs: [
          'Use go test -count=20 -race ./pkg/... to reproduce timing bugs locally and verify fixes before graduating a quarantined test.',
        ],
      },
    ],
  },
  {
    slug: 'junit-flaky-tests',
    section: 'guides',
    title: 'JUnit Flaky Tests & XML Reporting in CI | FlakeCheck',
    description: 'Universal flaky test detection for Java, Kotlin, Maven, Gradle, .NET, and Ruby using JUnit XML reports with FlakeCheck.',
    h1: 'JUnit Flaky Tests: Universal XML Ingestion Across Any Language',
    category: 'Framework Guides',
    publishedAt: '2026-10-20',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['JUnit flaky tests', 'flaky tests CI', 'JUnit XML', 'FlakeCheck'],
    sections: [
      {
        heading: 'Why JUnit XML Remains the Universal CI Contract',
        paragraphs: [
          'Maven Surefire, Gradle, RSpec, PHPUnit, NUnit, Cargo nextest, and virtually every test runner can emit JUnit XML. FlakeCheck streams arbitrarily large JUnit XML files using a constant-memory edge parser on Cloudflare Workers.',
        ],
        code: {
          lang: 'bash',
          snippet: `mvn test -Dsurefire.rerunFailingTestsCount=2
npx @onurdrsn/flakecheck ingest "target/surefire-reports/TEST-*.xml" --format junit`,
        },
      },
    ],
  },
  {
    slug: 'github-actions-flaky-tests',
    section: 'guides',
    title: 'Flaky Tests in GitHub Actions & GitLab CI | FlakeCheck',
    description: 'Automate flaky test detection, PR comments, commit status checks, and quarantine in GitHub Actions, GitLab CI, CircleCI, and Jenkins.',
    h1: 'Managing Flaky Tests in GitHub Actions and GitLab CI',
    category: 'CI/CD Guides',
    publishedAt: '2026-10-22',
    updatedAt: '2026-11-19',
    readMinutes: 7,
    keywords: ['flaky test GitHub Actions', 'flaky tests CI', 'GitLab CI flaky tests', 'FlakeCheck'],
    sections: [
      {
        heading: 'GitHub Actions Integration with PR Comments & Status Checks',
        paragraphs: [
          'Integrate FlakeCheck into GitHub Actions in under two minutes. After your test step produces a JUnit, CTRF, or framework JSON report, stream it to FlakeCheck to automatically score flaky tests, post a Markdown reliability summary on the Pull Request, and publish a commit status check.',
        ],
        code: {
          lang: 'yaml',
          snippet: `name: CI with FlakeCheck
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test -- --reporter=junit --outputFile=junit.xml
        continue-on-error: true
      - uses: ./ci-templates/github-action
        with:
          gateway-url: \${{ secrets.FLAKECHECK_URL }}
          token: \${{ secrets.FLAKECHECK_TOKEN }}
          format: junit
          files: junit.xml`,
        },
      },
      {
        heading: 'GitLab CI, CircleCI, and Jenkins Support',
        paragraphs: [
          'FlakeCheck ships ready-to-use templates in ci-templates/ for GitHub Actions, GitLab CI (.gitlab-ci.yml), CircleCI (.circleci/config.yml), and Jenkins (Jenkinsfile), all backed by the same idempotent webhook and CLI ingestion API.',
        ],
      },
    ],
  },
  {
    slug: 'flakecheck-vs-buildpulse',
    section: 'compare',
    title: 'FlakeCheck vs BuildPulse: Honest Comparison',
    description: 'Compare FlakeCheck and BuildPulse on self-hosting, pricing, CTRF/JUnit/Vitest/Playwright support, auto-quarantine, and open-source transparency.',
    h1: 'FlakeCheck vs BuildPulse: Which Flaky Test Detector Fits Your Team?',
    category: 'Comparisons',
    publishedAt: '2026-11-01',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['FlakeCheck vs BuildPulse', 'flaky test detector', 'BuildPulse alternative', 'FlakeCheck'],
    sections: [
      {
        heading: 'Architecture and Deployment Model',
        paragraphs: [
          'BuildPulse is a closed-source hosted SaaS focused on flaky test tracking and quarantining. FlakeCheck (also searched as Flake Check / flake-check) is an open-source, edge-native platform built on Hono, Cloudflare Workers, Drizzle ORM, and Neon PostgreSQL that you can either use hosted or self-host in your own Cloudflare account in minutes.',
        ],
      },
      {
        heading: 'Feature-by-Feature Transparency',
        paragraphs: [
          'Both tools ingest JUnit XML and identify flaky tests across CI runs. FlakeCheck additionally supports CTRF, Vitest, Mocha, Playwright, Pytest, Jest, and Go test JSON natively, ships a deterministic 6-class root cause classifier with remediation advice, provides non-blocking auto-quarantine policies with manual override protection, and exposes a documented OpenAPI 3.1 REST API with zero per-seat vendor lock-in.',
          'When BuildPulse may fit better: if your organization strictly requires a legacy enterprise vendor contract without managing Cloudflare Workers or Neon Postgres. When FlakeCheck fits better: if you want transparent statistical scoring (Wilson CI), open-source auditability, self-hosting control, and ultra-low serverless infrastructure costs.',
        ],
      },
    ],
  },
  {
    slug: 'flakecheck-vs-datadog-ci',
    section: 'compare',
    title: 'FlakeCheck vs Datadog CI Visibility',
    description: 'Honest comparison of FlakeCheck vs Datadog CI Visibility for flaky test detection, quarantine automation, setup complexity, and cost.',
    h1: 'FlakeCheck vs Datadog CI Visibility: Focused Flake Control vs Full APM',
    category: 'Comparisons',
    publishedAt: '2026-11-05',
    updatedAt: '2026-11-19',
    readMinutes: 6,
    keywords: ['FlakeCheck vs Datadog CI', 'Datadog CI Visibility alternative', 'flaky tests CI', 'FlakeCheck'],
    sections: [
      {
        heading: 'Dedicated Flaky Test Intelligence vs Enterprise APM Suite',
        paragraphs: [
          'Datadog CI Visibility is a powerful module inside the broader Datadog observability platform, priced per committer and tightly integrated with Datadog APM traces. For teams already paying for Datadog enterprise licenses, it provides unified APM + CI tracing.',
          'For teams that want dedicated flaky test detection, root-cause forensics, automated quarantine policies, and CI waste cost reporting without committing to per-committer APM pricing or heavy SDK instrumentation, FlakeCheck works out of the box with standard JUnit/CTRF/JSON reports and a single CLI command.',
        ],
      },
    ],
  },
];

export function findSeoGuide(section: 'guides' | 'compare', slug: string): SeoGuide | undefined {
  return SEO_GUIDES.find((g) => g.section === section && g.slug === slug);
}
