#!/usr/bin/env tsx
/**
 * Idempotent cron-job.org REST API synchronizer for FlakeCheck.
 * Official API Reference: https://docs.cron-job.org/rest-api.html
 *
 * Environment variables (never logged):
 * - CRONJOB_API_KEY      (required unless --dry-run)
 * - CRON_SECRET          (required)
 * - FLAKECHECK_BASE_URL  (required, must use https://)
 * - FLAKECHECK_ENV       (optional: "production" | "staging", default: "production")
 * - CRON_TIMEZONE        (optional: IANA timezone, default: "UTC")
 * - RETENTION_DRY_RUN    (optional: "true" | "false", default: "false")
 */

const API_BASE = 'https://api.cron-job.org';

interface CronJobSchedule {
  timezone: string;
  expiresAt: number;
  hours: number[];
  mdays: number[];
  minutes: number[];
  months: number[];
  wdays: number[];
}

interface DetailedJobPayload {
  enabled: boolean;
  title: string;
  url: string;
  saveResponses: boolean;
  requestMethod: number; // 1 = POST per docs.cron-job.org/rest-api.html#requestmethod
  requestTimeout: number;
  schedule: CronJobSchedule;
  notification: {
    onFailure: boolean;
    onFailureCount: number;
    onSuccess: boolean;
    onDisable: boolean;
  };
  extendedData: {
    headers: Record<string, string>;
    body: string;
  };
}

interface ExistingJob {
  jobId: number;
  title: string;
  url: string;
  enabled: boolean;
}

const dryRun = process.argv.includes('--dry-run');
const envName = (process.env.FLAKECHECK_ENV ?? 'production').trim().toLowerCase();
const timezone = (process.env.CRON_TIMEZONE ?? 'UTC').trim();
const retentionDryRun = (process.env.RETENTION_DRY_RUN ?? 'false').trim().toLowerCase() === 'true';
const baseUrl = (process.env.FLAKECHECK_BASE_URL ?? '').trim().replace(/\/+$/, '');
const cronSecret = (process.env.CRON_SECRET ?? '').trim();
const apiKey = (process.env.CRONJOB_API_KEY ?? '').trim();

if (!baseUrl || !baseUrl.startsWith('https://')) {
  console.error('Error: FLAKECHECK_BASE_URL must be set and use https://');
  process.exit(1);
}
if (!cronSecret) {
  console.error('Error: CRON_SECRET environment variable is required');
  process.exit(1);
}
if (!dryRun && !apiKey) {
  console.error('Error: CRONJOB_API_KEY environment variable is required (or pass --dry-run)');
  process.exit(1);
}

const desiredJobs: DetailedJobPayload[] = [
  {
    enabled: true,
    title: `[FlakeCheck:${envName}] Daily Digest`,
    url: `${baseUrl}/api/v1/internal/cron/digest?type=daily`,
    saveResponses: true,
    requestMethod: 1, // POST
    requestTimeout: 30,
    schedule: {
      timezone,
      expiresAt: 0,
      minutes: [0],
      hours: [8],
      mdays: [-1],
      months: [-1],
      wdays: [-1],
    },
    notification: {
      onFailure: true,
      onFailureCount: 1,
      onSuccess: false,
      onDisable: true,
    },
    extendedData: {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: '',
    },
  },
  {
    enabled: true,
    title: `[FlakeCheck:${envName}] Weekly Digest`,
    url: `${baseUrl}/api/v1/internal/cron/digest?type=weekly`,
    saveResponses: true,
    requestMethod: 1, // POST
    requestTimeout: 30,
    schedule: {
      timezone,
      expiresAt: 0,
      minutes: [0],
      hours: [9],
      mdays: [-1],
      months: [-1],
      wdays: [1], // Monday (0=Sun..6=Sat)
    },
    notification: {
      onFailure: true,
      onFailureCount: 1,
      onSuccess: false,
      onDisable: true,
    },
    extendedData: {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: '',
    },
  },
  {
    enabled: true,
    title: `[FlakeCheck:${envName}] Data Retention`,
    url: `${baseUrl}/api/v1/internal/cron/retention?dryRun=${retentionDryRun ? 'true' : 'false'}`,
    saveResponses: true,
    requestMethod: 1, // POST
    requestTimeout: 30,
    schedule: {
      timezone,
      expiresAt: 0,
      minutes: [0],
      hours: [3],
      mdays: [-1],
      months: [-1],
      wdays: [0], // Sunday 03:00 UTC
    },
    notification: {
      onFailure: true,
      onFailureCount: 1,
      onSuccess: false,
      onDisable: true,
    },
    extendedData: {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: '',
    },
  },
];

function redactJobForLog(job: DetailedJobPayload) {
  return {
    title: job.title,
    url: job.url,
    method: 'POST',
    timeoutSec: job.requestTimeout,
    schedule: job.schedule,
    notification: job.notification,
    headers: { Authorization: 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cronJobApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`cron-job.org API ${init.method ?? 'GET'} ${path} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function main() {
  if (dryRun) {
    console.log(`[dry-run] Planned cron-job.org sync for env="${envName}" (timezone=${timezone}):`);
    for (const job of desiredJobs) {
      console.log(JSON.stringify(redactJobForLog(job), null, 2));
    }
    return;
  }

  const list = await cronJobApi<{ jobs: ExistingJob[] }>('/jobs');
  const existingByTitle = new Map((list.jobs ?? []).map((j) => [j.title, j]));

  for (const job of desiredJobs) {
    const existing = existingByTitle.get(job.title);
    if (existing) {
      await cronJobApi(`/jobs/${existing.jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({ job }),
      });
      console.log(`Updated cron-job.org job #${existing.jobId}: ${job.title} -> ${job.url}`);
    } else {
      const created = await cronJobApi<{ jobId: number }>('/jobs', {
        method: 'PUT',
        body: JSON.stringify({ job }),
      });
      console.log(`Created cron-job.org job #${created.jobId}: ${job.title} -> ${job.url}`);
    }
    // Respect cron-job.org mutation rate limit (max 1 req/sec)
    await sleep(1100);
  }
}

main().catch((err) => {
  console.error('cronjob-sync failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
