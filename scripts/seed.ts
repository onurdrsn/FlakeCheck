import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for seeding');
const sql = neon(url);
const repo = process.env.FLAKECHECK_SEED_REPO ?? 'demo/flakecheck';
const runId = `seed-run-${crypto.randomUUID()}`;
const testId = `seed-test-${crypto.randomUUID()}`;
await sql`insert into runs (id, repo, branch, commit_sha, ci_workflow, env_fingerprint, setup_duration_ms, duration_ms) values (${runId}, ${repo}, 'main', 'seed-commit', 'seed', 'seed-environment', 1200, 30000)`;
await sql`insert into tests (id, repo, file_path, suite_name, test_name) values (${testId}, ${repo}, 'tests/demo.test.ts', 'demo', 'demonstrates a flaky test')`;
await sql`insert into test_attempts (id, run_id, test_id, attempt_number, status, duration_ms, failure_signature, raw_error) values (${`seed-attempt-${crypto.randomUUID()}`}, ${runId}, ${testId}, 1, 'FAILED', 900, 'seed-signature', 'seed failure')`;
await sql`insert into classifications (id, test_id, run_id, category, confidence, evidence) values (${`seed-classification-${crypto.randomUUID()}`}, ${testId}, ${runId}, 'INSUFFICIENT_DATA', 0, ${JSON.stringify({ source: 'seed', repo })})`;
console.log(`Seeded ${repo}`);
