#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { cwd, exit } from 'node:process';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import { Command, InvalidArgumentError } from 'commander';
import { appendFileSync } from 'node:fs';
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
function openDashboard(url: string) {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

const program = new Command().name('flakecheck').description('HTTP-only FlakeCheck Gateway client').version('0.1.0');
program.command('server').description('open the hosted FlakeCheck web dashboard')
  .option('--url <url>', 'dashboard URL', process.env.FLAKECHECK_DASHBOARD_URL)
  .option('--no-open', 'print the URL without opening a browser')
  .action((options: { url?: string; open: boolean }) => {
    const url = options.url?.trim();
    if (!url) throw new CliError(1, 'Set FLAKECHECK_DASHBOARD_URL or pass --url <dashboard-url>');
    let dashboardUrl: URL;
    try {
      dashboardUrl = new URL(url);
      if (!['http:', 'https:'].includes(dashboardUrl.protocol)) throw new Error('URL must use http or https');
    } catch (error) {
      throw new CliError(1, `Invalid dashboard URL: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(`FlakeCheck dashboard: ${dashboardUrl.toString()}`);
    if (options.open) openDashboard(dashboardUrl.toString());
  });
program.command('init').description('create a repository-scoped CLI configuration')
  .requiredOption('--gateway <url>', 'Gateway URL')
  .requiredOption('--repo <owner/name>', 'canonical repository', validRepo)
  .requiredOption('--token <token>', 'repository API token')
  .action((options: { gateway: string; repo: string; token: string }) => {
    writeFileSync(configPath, `${JSON.stringify({ gatewayUrl: options.gateway.replace(/\/+$/, ''), repo: options.repo, token: options.token }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote ${configPath}`);
  });
program.command('ingest <fileOrGlob>').description('stream a test report to the Gateway')
  .requiredOption('--format <type>', 'report format', validFormat)
  .action(async (input: string, options: { format: Format }) => {
    const api = client();
    const files = filesFor(input);
    if (!files.length) throw new CliError(1, `No files matched ${input}`);
    for (const file of files) {
      if (!existsSync(file)) throw new CliError(1, `Report does not exist: ${posixPath(file)}`);
      const response = await api.request<{ runId: string; ingestedAttempts: number }>('/api/ingest', { method: 'POST', headers: { 'X-FlakeCheck-Format': options.format, 'Content-Type': 'application/octet-stream' }, body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array> });
      console.log(`${posixPath(file)}: ${response.runId} (${response.ingestedAttempts} attempts)`);
    }
  });
program.command('analyze').description('classify the current repository window')
  .option('--window <runs>', 'window size', (value) => Number.parseInt(value, 10), 30)
  .option('--fail-on-flake', 'exit 2 when flakes are found')
  .action(async (options: { window: number; failOnFlake?: boolean }) => {
    const api = client(); const config = loadConfig();
    const result = await api.request<{ classifiedCount: number; flakesFound: number }>('/api/analyze', { method: 'POST', body: JSON.stringify({ repo: config.repo, runId: 'latest', windowSize: options.window }), headers: { 'Content-Type': 'application/json' } });
    console.log(JSON.stringify(result, null, 2));
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
program.command('doctor').description('check Gateway and Worker health').action(async () => {
  const result = await client().request<{ status: string; checks: string[] }>('/api/health');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') throw new CliError(1, 'Gateway health is degraded');
});
program.command('report').description('write a Markdown CI/PR report')
  .option('--format <format>', 'github-pr or markdown', 'github-pr')
  .option('--dashboard <url>', 'dashboard review URL')
  .action(async (options: { format: string; dashboard?: string }) => {
    if (!['github-pr', 'markdown'].includes(options.format)) throw new CliError(1, '--format must be github-pr or markdown');
    const api = client();
    const [summary, flakeResponse] = await Promise.all([
      api.request<{ wasteSeconds: number; wasteUsd: number; activeFlakes: number }>('/api/summary'),
      api.flakes(),
    ]);
    const markdown = githubMarkdown(summary, flakeResponse.items, options.dashboard);
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) appendFileSync(summaryPath, `${markdown}\n`);
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
