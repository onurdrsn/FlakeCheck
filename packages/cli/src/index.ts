#!/usr/bin/env node
import { appendFileSync, createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { cwd, exit } from 'node:process';
import { Command, InvalidArgumentError } from 'commander';
import { githubMarkdown } from './report.js';

type Config = { gatewayUrl: string; repo: string; token: string };
type Flake = { testId?: string; runId?: string; category?: string; confidence?: number; evidence?: Record<string, unknown>; filePath?: string; suiteName?: string; testName?: string };
type FlakeResponse = { items: Flake[]; page?: number; pageSize?: number };
type Format = 'junit' | 'jest' | 'playwright' | 'pytest' | 'go';

class CliError extends Error { constructor(public readonly code: number, message: string) { super(message); } }

const configPath = resolve(cwd(), '.flakecheckrc.json');
const posixPath = (value: string) => value.replaceAll('\\', '/');
const validRepo = (value: string) => {
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) throw new InvalidArgumentError('repository must be in owner/name format');
  return value;
};
const validFormat = (value: string): Format => {
  if (!['junit', 'jest', 'playwright', 'pytest', 'go'].includes(value)) throw new InvalidArgumentError('format must be junit, jest, playwright, pytest, or go');
  return value as Format;
};
function loadConfig(): Config {
  if (!existsSync(configPath)) throw new CliError(1, `Missing ${basename(configPath)}; run "flakecheck init" first`);
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<Config>;
    if (!config.gatewayUrl || !config.repo || !config.token) throw new Error('gatewayUrl, repo and token are required');
    return { gatewayUrl: config.gatewayUrl.replace(/\/+$/, ''), repo: validRepo(config.repo), token: config.token };
  } catch (error) {
    throw new CliError(1, `Invalid ${basename(configPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
class GatewayClient {
  constructor(private readonly config: Config) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-FlakeCheck-Token', this.config.token);
    headers.set('X-FlakeCheck-Repo', this.config.repo);
    const url = new URL(path, `${this.config.gatewayUrl}/`);
    if (!url.searchParams.has('repo')) url.searchParams.set('repo', this.config.repo);
    const requestInit = { ...init, headers } as RequestInit & { duplex?: 'half' };
    if (init.body && typeof init.body !== 'string' && init.method !== 'GET' && init.method !== 'HEAD') requestInit.duplex = 'half';
    const response = await fetch(url, requestInit);
    const body = await response.text();
    let parsed: unknown = body;
    try { parsed = body ? JSON.parse(body) : undefined; } catch { /* text response */ }
    if (!response.ok) throw new CliError(1, `${response.status} ${response.statusText}: ${typeof parsed === 'object' && parsed !== null && 'error' in parsed ? String((parsed as { error: unknown }).error) : body}`);
    return parsed as T;
  }
  flakes(format = 'json') { return this.request<FlakeResponse>(`/api/flakes?page=1&pageSize=100`, { headers: { Accept: format === 'json' ? 'application/json' : 'text/plain' } }); }
}
function client() { return new GatewayClient(loadConfig()); }
function matches(pattern: string, value: string) {
  const escaped = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}$`, 'i').test(posixPath(value));
}
function filesFor(input: string): string[] {
  const normalized = posixPath(input);
  if (!normalized.includes('*')) return [resolve(cwd(), input)];
  const root = resolve(cwd(), dirname(normalized.split('*')[0] || '.'));
  const suffix = normalized.slice(normalized.indexOf('*'));
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of requireDir(directory)) {
      const path = resolve(directory, entry);
      if (entry === 'node_modules' || entry === '.git') continue;
      if (isDirectory(path)) walk(path);
      else if (matches(suffix, posixPath(path).slice(posixPath(root).length + 1))) found.push(path);
    }
  };
  walk(root);
  return found;
}
function requireDir(path: string): string[] { return readdirSync(path); }
function isDirectory(path: string) { return statSync(path).isDirectory(); }
function outputTable(items: Flake[]) {
  const rows = items.map((item) => [item.category ?? '-', `${item.confidence ?? 0}%`, item.testName ?? item.testId ?? '-', item.filePath ?? '-']);
  const widths = rows.reduce((acc, row) => acc.map((size, index) => Math.max(size, row[index].length)), ['CATEGORY'.length, 'CONF'.length, 'TEST'.length, 'FILE'.length]);
  const line = (row: string[]) => row.map((value, index) => value.padEnd(widths[index])).join('  ');
  return `\x1b[36m${line(['CATEGORY', 'CONF', 'TEST', 'FILE'])}\x1b[0m\n${rows.map((row) => `${row[0]?.includes('FLAKE') ? '\x1b[33m' : '\x1b[31m'}${line(row)}\x1b[0m`).join('\n')}`;
}
function asCsv(items: Flake[]) { return ['test_id,run_id,category,confidence,file_path,test_name', ...items.map((item) => [item.testId, item.runId, item.category, item.confidence, item.filePath, item.testName].map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))].join('\n'); }
function asMarkdown(items: Flake[]) { return ['| Test | Category | Confidence | File |', '|---|---|---:|---|', ...items.map((item) => `| ${item.testName ?? item.testId ?? '-'} | ${item.category ?? '-'} | ${item.confidence ?? 0}% | ${item.filePath ?? '-'} |`)].join('\n'); }
function addCommonOptions(command: Command) { return command.option('-c, --config <path>', 'configuration path', configPath); }
function formatTerminalLink(url: string): string {
  return process.stdout.isTTY ? `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\` : url;
}

function getCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    if (!pkg.version) throw new Error('package.json does not define a version');
    return pkg.version;
  } catch (error) {
    throw new Error(`Failed to read CLI version from package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const program = new Command().name('flakecheck').description('HTTP-only FlakeCheck Gateway client').version(getCliVersion());
program.command('server').description('print the hosted FlakeCheck web dashboard URL')
  .option('--url <url>', 'dashboard URL (defaults to gatewayUrl in .flakecheckrc.json)')
  .option('--no-open', 'print the plain URL without terminal hyperlink formatting')
  .action((options: { url?: string; open: boolean }) => {
    let url = options.url?.trim();
    if (!url && existsSync(configPath)) {
      try { url = loadConfig().gatewayUrl; } catch { /* ignore fallback error */ }
    }
    if (!url) throw new CliError(1, 'Pass --url <dashboard-url> or configure gatewayUrl via "flakecheck init"');
    let dashboardUrl: URL;
    try {
      dashboardUrl = new URL(url);
      if (!['http:', 'https:'].includes(dashboardUrl.protocol)) throw new Error('URL must use http or https');
    } catch (error) {
      throw new CliError(1, `Invalid dashboard URL: ${error instanceof Error ? error.message : String(error)}`);
    }
    const resolved = dashboardUrl.toString();
    console.log(`FlakeCheck dashboard: ${options.open ? formatTerminalLink(resolved) : resolved}`);
  });
program.command('init').description('create a repository-scoped CLI configuration')
  .requiredOption('--gateway <url>', 'Gateway URL')
  .requiredOption('--repo <owner/name>', 'canonical repository', validRepo)
  .requiredOption('--token <token>', 'repository API token')
  .action((options: { gateway: string; repo: string; token: string }) => {
    writeFileSync(configPath, `${JSON.stringify({ gatewayUrl: options.gateway.replace(/\/+$/, ''), repo: options.repo, token: options.token }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote ${configPath}`);
  });
class Spinner {
  private timer?: NodeJS.Timeout;
  private frame = 0;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private isTty: boolean;

  constructor(private message: string) {
    this.isTty = Boolean(process.stdout.isTTY);
  }

  start() {
    if (!this.isTty) {
      console.log(`... ${this.message}`);
      return this;
    }
    process.stdout.write(`\x1b[?25l\x1b[36m${this.frames[0]}\x1b[0m ${this.message}`);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % this.frames.length;
      process.stdout.write(`\r\x1b[36m${this.frames[this.frame]}\x1b[0m ${this.message}`);
    }, 80);
    return this;
  }

  stop(status: 'ok' | 'error' = 'ok', finishMessage?: string) {
    if (this.timer) clearInterval(this.timer);
    const msg = finishMessage ?? this.message;
    if (this.isTty) {
      const symbol = status === 'ok' ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
      process.stdout.write(`\r${symbol} ${msg}\x1b[K\n\x1b[?25h`);
    } else if (finishMessage) {
      console.log(`${status === 'ok' ? '✔' : '✖'} ${finishMessage}`);
    }
  }
}

function readGitMetadataFromFs(startDir = cwd()): { commitSha?: string; branch?: string } {
  try {
    let dir = resolve(startDir);
    let gitDir: string | undefined;
    while (true) {
      const candidate = resolve(dir, '.git');
      if (existsSync(candidate)) {
        if (isDirectory(candidate)) {
          gitDir = candidate;
        } else {
          const pointer = readFileSync(candidate, 'utf8').trim();
          if (pointer.startsWith('gitdir:')) {
            gitDir = resolve(dir, pointer.slice('gitdir:'.length).trim());
          }
        }
        break;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (!gitDir) return {};
    const headPath = resolve(gitDir, 'HEAD');
    if (!existsSync(headPath)) return {};
    const head = readFileSync(headPath, 'utf8').trim();
    if (!head.startsWith('ref:')) {
      return /^[0-9a-f]{40}$/i.test(head) ? { commitSha: head } : {};
    }
    const ref = head.slice('ref:'.length).trim();
    const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;
    const refFile = resolve(gitDir, ref);
    let commitSha: string | undefined;
    if (existsSync(refFile)) {
      commitSha = readFileSync(refFile, 'utf8').trim() || undefined;
    } else {
      const packedRefsPath = resolve(gitDir, 'packed-refs');
      if (existsSync(packedRefsPath)) {
        const line = readFileSync(packedRefsPath, 'utf8')
          .split('\n')
          .find((entry) => !entry.startsWith('#') && entry.trim().endsWith(` ${ref}`));
        if (line) commitSha = line.trim().split(/\s+/)[0];
      }
    }
    return { ...(commitSha ? { commitSha } : {}), ...(branch ? { branch } : {}) };
  } catch {
    return {};
  }
}

function detectGitContext(): { commitSha?: string; branch?: string } {
  return readGitMetadataFromFs();
}

program.command('ingest <fileOrGlob>').description('stream a test report to the Gateway')
  .requiredOption('--format <type>', 'report format', validFormat)
  .option('--commit <sha>', 'Git commit SHA')
  .option('--branch <name>', 'Git branch name')
  .action(async (input: string, options: { format: Format; commit?: string; branch?: string }) => {
    const api = client();
    const files = filesFor(input);
    if (!files.length) throw new CliError(1, `No files matched ${input}`);

    const git = detectGitContext();
    const commitSha = options.commit || git.commitSha;
    const branch = options.branch || git.branch;

    for (const file of files) {
      if (!existsSync(file)) throw new CliError(1, `Report does not exist: ${posixPath(file)}`);
      const spinner = new Spinner(`Streaming ${basename(file)} to FlakeCheck Gateway...`).start();
      try {
        const headers: Record<string, string> = {
          'X-FlakeCheck-Format': options.format,
          'Content-Type': 'application/octet-stream',
          'X-FlakeCheck-Source-File-Path': posixPath(file),
        };
        if (commitSha) headers['X-FlakeCheck-Commit-Sha'] = commitSha;
        if (branch) headers['X-FlakeCheck-Branch'] = branch;

        const response = await api.request<{ runId: string; ingestedAttempts: number }>('/api/ingest', {
          method: 'POST',
          headers,
          body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
        });
        spinner.stop('ok', `${posixPath(file)}: ${response.runId} (${response.ingestedAttempts} attempts ingested) [commit: ${commitSha ? commitSha.slice(0, 7) : 'n/a'}]`);
      } catch (err) {
        spinner.stop('error', `Failed to ingest ${posixPath(file)}`);
        throw err;
      }
    }
  });

type AnalysisDetailResponse = {
  classifiedCount: number;
  flakesFound: number;
  cleanCount?: number;
  runsAnalyzed?: number;
  attemptsAnalyzed?: number;
  windowSize?: number;
  runId?: string;
  breakdown?: Record<string, number>;
  latestRun?: { id: string; commitSha: string; createdAt: string } | null;
};

program.command('analyze').description('classify the current repository window')
  .option('--window <runs>', 'window size', (value) => Number.parseInt(value, 10), 30)
  .option('--fail-on-flake', 'exit 2 when flakes are found')
  .option('--json', 'output raw JSON')
  .action(async (options: { window: number; failOnFlake?: boolean; json?: boolean }) => {
    const api = client(); const config = loadConfig();
    const spinner = new Spinner(`Analyzing repository window (${options.window} runs)...`).start();
    let result: AnalysisDetailResponse;
    try {
      result = await api.request<AnalysisDetailResponse>('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ repo: config.repo, runId: 'latest', windowSize: options.window }),
        headers: { 'Content-Type': 'application/json' },
      });
      spinner.stop('ok', 'Analysis complete.');
    } catch (err) {
      spinner.stop('error', 'Analysis failed.');
      throw err;
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n\x1b[1m\x1b[36m📊 FlakeCheck Analysis Results\x1b[0m');
      console.log(`  \x1b[36mRepository:\x1b[0m ${config.repo}`);
      console.log(`  \x1b[36mAnalysis Run ID:\x1b[0m ${result.runId ?? 'latest'}`);
      console.log(`  \x1b[36mWindow Scope:\x1b[0m ${result.runsAnalyzed ?? result.windowSize ?? options.window} runs analyzed`);
      if (result.attemptsAnalyzed !== undefined) {
        console.log(`  \x1b[36mTotal Attempts Evaluated:\x1b[0m ${result.attemptsAnalyzed}`);
      }

      console.log('\n\x1b[1m[Classification Breakdown]\x1b[0m');
      console.log(`  Total Tests Evaluated: \x1b[1m${result.classifiedCount}\x1b[0m`);
      console.log(`  Stable / Clean Tests:  \x1b[32m${result.cleanCount ?? Math.max(0, result.classifiedCount - result.flakesFound)}\x1b[0m`);
      console.log(`  Flakes Detected:       ${result.flakesFound > 0 ? `\x1b[31m${result.flakesFound}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);

      if (result.breakdown && Object.keys(result.breakdown).length > 0) {
        console.log('\n\x1b[1m[Category Distribution]\x1b[0m');
        for (const [category, count] of Object.entries(result.breakdown)) {
          const isFlaky = ['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE'].includes(category);
          const color = isFlaky ? '\x1b[33m' : '\x1b[32m';
          console.log(`  ${color}•\x1b[0m ${category.padEnd(25)}: ${count}`);
        }
      }

      console.log('\n\x1b[1m[Verdict]\x1b[0m');
      if (result.flakesFound === 0) {
        console.log('  \x1b[32m✔ All evaluated tests in this window are deterministic and stable.\x1b[0m\n');
      } else {
        console.log(`  \x1b[31m✖ ${result.flakesFound} flaky test(s) detected. Run "flakecheck flakes" to inspect details.\x1b[0m\n`);
      }
    }

    if (options.failOnFlake && result.flakesFound > 0) throw new CliError(2, `${result.flakesFound} flakes found`);
  });
program.command('flakes').description('list active flakes')
  .option('--format <format>', 'table or json', 'table')
  .action(async (options: { format: string }) => {
    const result = await client().flakes();
    if (options.format === 'json') console.log(JSON.stringify(result.items, null, 2));
    else if (options.format === 'table') console.log(result.items.length ? outputTable(result.items) : 'No active flakes.');
    else throw new CliError(1, '--format must be table or json');
  });
program.command('quarantine <testId>').description('add, remove, or list quarantine state')
  .option('--action <action>', 'add, remove, or list', 'add')
  .option('--reason <reason>', 'audit reason')
  .action(async (testId: string, options: { action: string; reason?: string }) => {
    const api = client(); const config = loadConfig();
    if (options.action === 'list') { const result = await api.flakes(); console.log(JSON.stringify(result.items.filter((item) => item.testId === testId), null, 2)); return; }
    if (!['add', 'remove'].includes(options.action)) throw new CliError(1, '--action must be add, remove, or list');
    await api.request('/api/quarantine', { method: 'POST', body: JSON.stringify({ testId, state: options.action === 'add', reason: options.reason }), headers: { 'Content-Type': 'application/json' } });
    console.log(`${testId}: ${options.action === 'add' ? 'quarantined' : 'removed from quarantine'}`);
  });
program.command('export').description('export active flakes')
  .requiredOption('--target <target>', 'csv, json, or markdown')
  .option('--output <file>', 'write to a file instead of stdout')
  .action(async (options: { target: string; output?: string }) => {
    const result = await client().flakes();
    const content = options.target === 'csv' ? asCsv(result.items) : options.target === 'markdown' ? asMarkdown(result.items) : options.target === 'json' ? JSON.stringify(result.items, null, 2) : (() => { throw new CliError(1, '--target must be csv, json, or markdown'); })();
    if (options.output) writeFileSync(resolve(cwd(), options.output), `${content}\n`); else console.log(content);
  });
type HealthService = { name: string; status: 'ok' | 'error'; durationMs?: number; error?: string };
type HealthCheckResponse = { status: string; gateway?: string; services?: HealthService[]; checks?: string[] };

program.command('doctor')
  .description('check local configuration, Gateway, and backend service health')
  .option('--json', 'output diagnostics as raw JSON')
  .action(async (options: { json?: boolean }) => {
    let config: Config | null = null;
    let configError: string | null = null;
    try {
      config = loadConfig();
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error);
    }

    if (!config) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: configError }, null, 2));
      } else {
        console.error(`\x1b[31m✖ Configuration Error:\x1b[0m ${configError}`);
      }
      throw new CliError(1, 'Doctor check failed: missing or invalid configuration');
    }

    const api = new GatewayClient(config);

    let health: HealthCheckResponse | null = null;
    let healthError: string | null = null;
    try {
      health = await api.request<HealthCheckResponse>('/api/health');
    } catch (error) {
      healthError = error instanceof Error ? error.message : String(error);
    }

    let repoAuthOk = false;
    let repoAuthError: string | null = null;
    try {
      await api.request<{ activeFlakes?: number }>('/api/summary');
      repoAuthOk = true;
    } catch (error) {
      repoAuthError = error instanceof Error ? error.message : String(error);
    }

    const defaultServiceNames = [
      'Ingestion Service Worker',
      'Analysis Service Worker',
      'Quarantine Service Worker',
      'Neon Database (PostgreSQL)',
    ];

    const services: HealthService[] = health?.services ?? (health?.checks ? health.checks.map((chk, i) => ({
      name: defaultServiceNames[i] ?? `Service ${i + 1}`,
      status: chk === 'fulfilled' ? 'ok' : 'error',
    })) : []);

    const overallHealthy = Boolean(health && health.status === 'ok');

    if (options.json) {
      console.log(JSON.stringify({
        status: overallHealthy ? 'ok' : 'degraded',
        config: {
          path: configPath,
          repo: config.repo,
          gatewayUrl: config.gatewayUrl,
          tokenConfigured: true,
        },
        repositoryAuth: {
          status: repoAuthOk ? 'ok' : 'error',
          error: repoAuthError,
        },
        gateway: health?.gateway ?? (health ? 'ok' : 'unreachable'),
        services,
        ...(healthError ? { gatewayError: healthError } : {}),
      }, null, 2));
    } else {
      console.log('\x1b[1m\x1b[36m🩺 FlakeCheck Doctor Diagnostics\x1b[0m\n');
      console.log('\x1b[1m[Local Configuration]\x1b[0m');
      console.log(`  \x1b[32m✔\x1b[0m Config file: ${basename(configPath)} (loaded)`);
      console.log(`  \x1b[32m✔\x1b[0m Repository: ${config.repo}`);
      console.log(`  \x1b[32m✔\x1b[0m Gateway URL: ${config.gatewayUrl}`);
      console.log(`  \x1b[32m✔\x1b[0m API Token: ${config.token.slice(0, 6)}...${config.token.slice(-4)}`);

      console.log('\n\x1b[1m[Repository Authentication]\x1b[0m');
      if (repoAuthOk) {
        console.log(`  \x1b[32m✔\x1b[0m Verified token access for ${config.repo}`);
      } else {
        console.log(`  \x1b[33m!\x1b[0m Repository access check: ${repoAuthError}`);
      }

      console.log('\n\x1b[1m[Gateway & Backend Services]\x1b[0m');
      if (healthError) {
        console.log(`  \x1b[31m✖\x1b[0m Gateway unreachable: ${healthError}`);
      } else {
        console.log(`  \x1b[32m✔\x1b[0m Gateway Service: Healthy`);
        for (const s of services) {
          const latency = s.durationMs !== undefined ? ` (${s.durationMs}ms)` : '';
          if (s.status === 'ok') {
            console.log(`  \x1b[32m✔\x1b[0m ${s.name}: Healthy${latency}`);
          } else {
            console.log(`  \x1b[31m✖\x1b[0m ${s.name}: Degraded${latency}${s.error ? ` - ${s.error}` : ''}`);
          }
        }
      }

      console.log('\n\x1b[1m[Status Verdict]\x1b[0m');
      if (overallHealthy && repoAuthOk) {
        console.log('  \x1b[32m✔ All systems and configurations are operational.\x1b[0m\n');
      } else if (overallHealthy) {
        console.log('  \x1b[33m! Services are healthy, but repository token verification requires attention.\x1b[0m\n');
      } else {
        console.log('  \x1b[31m✖ Gateway health is degraded or unreachable.\x1b[0m\n');
      }
    }

    if (!overallHealthy) throw new CliError(1, 'Gateway health is degraded');
  });
program.command('report').description('write a Markdown CI/PR report')
  .option('--format <format>', 'github-pr or markdown', 'github-pr')
  .option('--dashboard <url>', 'dashboard review URL')
  .option('--output <file>', 'append Markdown report to a file')
  .action(async (options: { format: string; dashboard?: string; output?: string }) => {
    if (!['github-pr', 'markdown'].includes(options.format)) throw new CliError(1, '--format must be github-pr or markdown');
    const api = client();
    const [summary, flakeResponse] = await Promise.all([
      api.request<{ wasteSeconds: number; wasteUsd: number; activeFlakes: number }>('/api/summary'),
      api.flakes(),
    ]);
    const markdown = githubMarkdown(summary, flakeResponse.items, options.dashboard);
    if (options.output) appendFileSync(resolve(cwd(), options.output), `${markdown}\n`);
    console.log(markdown);
  });
program.command('demo').description('send a synthetic Jest report through the Gateway').action(async () => {
  const report = JSON.stringify({ testResults: [{ name: 'flakecheck-demo.test.ts', status: 'failed', assertionResults: [{ ancestorTitles: ['demo'], title: 'synthetic flaky test', status: 'failed', failureMessages: ['demo failure'] }] }] });
  const result = await client().request('/api/ingest', { method: 'POST', headers: { 'X-FlakeCheck-Format': 'jest', 'Content-Type': 'application/json' }, body: report });
  console.log('Demo report ingested:', JSON.stringify(result));
});
program.addHelpText('after', '\nConfiguration: .flakecheckrc.json (created by flakecheck init)\n');

try {
  await program.parseAsync();
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError(1, error instanceof Error ? error.message : String(error));
  console.error(`flakecheck: ${cliError.message}`);
  exit(cliError.code);
}
